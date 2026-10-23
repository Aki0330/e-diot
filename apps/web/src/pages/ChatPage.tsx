import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { api } from "../api/client.js";
import type { ChatResponse, ChatSessionDetail, SessionItem } from "../api/types.js";
import { useToast } from "../components/Toast.js";
import { INTENT_LABELS, formatContent } from "../utils/format.js";

const SUGGESTIONS = [
  "午餐花了50元",
  "这个月餐饮花了多少",
  "餐饮2000，交通500，购物1000",
  "还剩多少预算",
  "帮我看看最近的账单",
];

interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly intentType?: string | null;
  readonly graphPath?: string | null;
}

export interface ChatPageProps {
  readonly active: boolean;
  readonly sidebarCollapsed: boolean;
  /** 记账/预算类消息后让数据页失效 */
  readonly onDataChanged: () => void;
}

/** 对话页：会话列表 + 消息流 + 输入框（对应旧 initChatPage 及全部 chat 交互） */
export function ChatPage({ active, sidebarCollapsed, onDataChanged }: ChatPageProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<readonly SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const data = await api.sessions();
      setSessions(data.sessions);
    } catch {
      // 会话列表不是关键路径
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!active) return;
    const element = messagesRef.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [active, messages, sending]);

  const send = async (raw: string): Promise<void> => {
    const message = raw.trim();
    if (message === "" || sending) return;

    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const data: ChatResponse = await api.chat(message, currentSessionId);
      setCurrentSessionId(data.session_id);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          intentType: data.intent_type,
          graphPath: data.graph_path,
        },
      ]);
      await loadSessions();
      if (/花了|赚了|买了|预算|分配/.test(message)) onDataChanged();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `抱歉，出了点问题：${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const switchSession = async (sessionId: string): Promise<void> => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    setMessages([]);
    try {
      const detail: ChatSessionDetail = await api.sessionDetail(sessionId);
      setMessages(
        detail.messages.map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
          intentType: message.intent_type,
          graphPath: message.graph_path,
        })),
      );
    } catch {
      toast("加载历史失败", "error");
    }
    await loadSessions();
  };

  const newSession = (): void => {
    setCurrentSessionId(null);
    setMessages([]);
    void loadSessions();
  };

  const deleteSession = async (sessionId: string): Promise<void> => {
    if (!window.confirm("删除这个对话？")) return;
    try {
      await api.deleteSession(sessionId);
      if (sessionId === currentSessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
      await loadSessions();
    } catch {
      toast("删除失败", "error");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="chat-page">
      <div
        className={`chat-session-bar${sidebarCollapsed ? " collapsed" : ""}`}
        id="chat-session-bar"
      >
        <button className="btn-session-new" onClick={newSession}>
          ＋ 新对话
        </button>
        <div className="session-list">
          {sessions.map((session) => (
            <div
              key={session.session_id}
              className={`session-item${session.session_id === currentSessionId ? " active" : ""}`}
              onClick={() => void switchSession(session.session_id)}
            >
              <span className="session-title">{session.title}</span>
              <button
                className="session-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  void deleteSession(session.session_id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-messages" ref={messagesRef}>
          {messages.length === 0 && !sending && (
            <div className="chat-welcome">
              <div className="chat-welcome-emoji">👋</div>
              <div className="chat-welcome-title">你好，我是你的AI财务助手</div>
              <div className="chat-welcome-sub">可以记账、查预算、分配预算，随便聊聊～</div>
              <div className="chat-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="chat-suggestion"
                    onClick={() => void send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-avatar">{message.role === "user" ? "😎" : "🤖"}</div>
              <div>
                <div
                  className="message-bubble"
                  dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
                />
                {message.role === "assistant" && message.intentType && message.graphPath && (
                  <div className="msg-trace">
                    {INTENT_LABELS[message.intentType] ?? message.intentType} · {message.graphPath}
                  </div>
                )}
              </div>
            </div>
          ))}

          {sending && (
            <div className="typing-dots">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>

        <div className="chat-input-area">
          <div className="chat-input-wrap">
            <textarea
              id="chat-input"
              rows={1}
              placeholder="输入消息..."
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                const element = event.currentTarget;
                element.style.height = "auto";
                element.style.height = `${Math.min(element.scrollHeight, 100)}px`;
              }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button className="btn-send" disabled={sending} onClick={() => void send(input)}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
