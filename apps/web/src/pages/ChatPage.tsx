import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { api } from "../api/client.js";
import type { ChatResponse, CitationItem, ChatSessionDetail, SessionItem } from "../api/types.js";
import { useToast } from "../components/Toast.js";
import { INTENT_LABELS, formatContent } from "../utils/format.js";

const CATEGORY_LABELS: Record<string, string> = {
  category_rule: "分类规则",
  saving_advice: "省钱建议",
};

function citationCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

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
  readonly messageId?: number;
  readonly isProactive?: boolean;
  readonly citations?: readonly CitationItem[];
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "更早";
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface SessionGroup {
  readonly label: string;
  readonly items: SessionItem[];
}

function groupSessions(sessions: readonly SessionItem[]): SessionGroup[] {
  const groups: SessionGroup[] = [];
  for (const session of sessions) {
    const label = dayLabel(session.updated_at);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.label === label) {
      last.items.push(session);
    } else {
      groups.push({ label, items: [session] });
    }
  }
  return groups;
}

interface SessionListProps {
  readonly sessions: readonly SessionItem[];
  readonly currentSessionId: string | null;
  readonly onSelect: (sessionId: string) => void;
  readonly onDelete: (sessionId: string) => void;
}

function SessionList({ sessions, currentSessionId, onSelect, onDelete }: SessionListProps) {
  const groups = groupSessions(sessions);
  return (
    <div className="session-groups">
      {groups.map((group) => (
        <div className="session-group" key={group.label}>
          <div className="session-group-title">{group.label}</div>
          {group.items.map((session) => (
            <div
              key={session.session_id}
              className={`rail-session${session.session_id === currentSessionId ? " active" : ""}`}
              onClick={() => onSelect(session.session_id)}
            >
              <span className="session-main">
                <span className="t">{session.title || "未命名会话"}</span>
                <span className="session-time">{timeLabel(session.updated_at)}</span>
              </span>
              <button
                className="del"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(session.session_id);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface ChatPageProps {
  readonly active: boolean;
  readonly sidebarCollapsed: boolean;
  /** 记账/预算类消息后让数据页失效 */
  readonly onDataChanged: () => void;
}

/** 对话页：会话列表 + 消息流 + 输入框（对应旧 initChatPage 及全部 chat 交互） */
export function ChatPage({ active, onDataChanged }: ChatPageProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<readonly SessionItem[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState<Record<number, string>>({});

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
          citations: data.citations ?? [],
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
          messageId: message.message_id,
          isProactive: message.is_proactive ?? false,
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

  const sendFeedback = async (
    messageId: number | undefined,
    value: "helpful" | "inaccurate" | "mute",
  ): Promise<void> => {
    if (messageId === undefined) return;
    try {
      const result = await api.proactiveFeedback(messageId, value);
      setFeedbackDone((prev) => ({ ...prev, [messageId]: value }));
      toast(
        value === "mute"
          ? "好的，1 天内不再主动提醒"
          : value === "inaccurate"
            ? "收到，会调整判断"
            : "谢谢反馈",
        "success",
      );
      if (result.snooze_until !== null) {
        setSessionsOpen(false);
      }
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">AI 助手 · 说句话就记好</p>
          <h2 className="page-title">AI 助手</h2>
          <p className="page-desc">日常怎么说话就怎么记；查花销、分预算，一句话也能问。</p>
        </div>
        <div className="head-side">
          <button className="btn-primary" onClick={newSession}>
            ＋ 新对话
          </button>
        </div>
      </div>

      <div className="chat-page">
        <section className="chat-panel">
          <div className="chat-panel-head">
            <span className="badge ink tiny">
              {currentSessionId === null ? "新会话" : "会话中"}
            </span>
            <div className="chat-panel-actions">
              <button
                className="memory-btn chat-sessions-btn"
                onClick={() => setSessionsOpen(true)}
              >
                历史会话 {sessions.length}
              </button>
              <span className="badge lime tiny">自然语言</span>
            </div>
          </div>

          <div className="chat-messages" ref={messagesRef}>
            {messages.length === 0 && !sending && (
              <div className="chat-welcome">
                <div className="chat-welcome-emoji">👋</div>
                <div className="chat-welcome-title">今天想记点什么？</div>
                <div className="chat-welcome-sub">
                  说一句就行，比如「早餐 12 块」。也可以让我帮你看看这个月的花销。
                </div>
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
                  {message.isProactive === true && (
                    <div className="proactive-head">
                      <span className="badge amber tiny">主动消息</span>
                    </div>
                  )}
                  <div
                    className="message-bubble"
                    dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
                  />
                  {message.role === "assistant" && message.intentType && message.graphPath && (
                    <div className="msg-trace">
                      {INTENT_LABELS[message.intentType] ?? message.intentType} ·{" "}
                      {message.graphPath}
                    </div>
                  )}
                  {message.role === "assistant" &&
                    message.citations !== undefined &&
                    message.citations.length > 0 && (
                      <div className="msg-sources">
                        <div className="msg-sources-title">📚 知识库来源</div>
                        {message.citations.map((citation, citationIndex) => (
                          <div className="msg-source" key={citationIndex}>
                            <span className="msg-source-head">
                              来源[{citationIndex + 1}] · {citationCategoryLabel(citation.category)} · 相关度{" "}
                              {citation.score.toFixed(4)}
                            </span>
                            <div className="msg-source-body">
                              {citation.content.length > 120
                                ? `${citation.content.slice(0, 120)}…`
                                : citation.content}
                            </div>
                            {citation.tags.length > 0 && (
                              <div className="msg-source-tags">
                                🏷️ {citation.tags.join(" / ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  {message.isProactive === true && message.messageId !== undefined && (
                    <div className="proactive-feedback">
                      {feedbackDone[message.messageId] !== undefined ? (
                        <span className="profile-hint">
                          已反馈：
                          {feedbackDone[message.messageId] === "mute"
                            ? "暂停提醒"
                            : feedbackDone[message.messageId] === "inaccurate"
                              ? "不准确"
                              : "有帮助"}
                        </span>
                      ) : (
                        <>
                          <button
                            className="memory-btn"
                            onClick={() => void sendFeedback(message.messageId, "helpful")}
                          >
                            有帮助
                          </button>
                          <button
                            className="memory-btn"
                            onClick={() => void sendFeedback(message.messageId, "inaccurate")}
                          >
                            不准确
                          </button>
                          <button
                            className="memory-btn"
                            onClick={() => void sendFeedback(message.messageId, "mute")}
                          >
                            暂时别提醒
                          </button>
                        </>
                      )}
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
        </section>

        <aside className="chat-rail">
          <div className="rail-card">
            <div className="rail-title">会话 / SESSIONS</div>
            <div className="rail-sessions">
              <SessionList
                sessions={sessions}
                currentSessionId={currentSessionId}
                onSelect={(sessionId) => void switchSession(sessionId)}
                onDelete={(sessionId) => void deleteSession(sessionId)}
              />
              {sessions.length === 0 && (
                <p className="rail-empty">还没有历史会话，先聊一句试试。</p>
              )}
            </div>
          </div>

          <div className="rail-card">
            <div className="rail-title">快速输入 / PROMPTS</div>
            <div className="chat-suggestions">
              {SUGGESTIONS.slice(0, 3).map((suggestion) => (
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

          <div className="rail-card">
            <div className="rail-title">状态 / STATUS</div>
            <div className="rail-status">
              <div className="row">
                <span>连接</span>
                <b>ONLINE</b>
              </div>
              <div className="row">
                <span>会话数</span>
                <b>{sessions.length}</b>
              </div>
              <div className="row">
                <span>数据</span>
                <b>实时</b>
              </div>
            </div>
          </div>
        </aside>

        {sessionsOpen && (
          <div className="session-drawer-mask" onClick={() => setSessionsOpen(false)}>
            <div className="session-drawer" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-head">
                <b>历史会话</b>
                <button className="memory-btn" onClick={() => setSessionsOpen(false)}>
                  关闭
                </button>
              </div>
              <button
                className="btn-primary"
                onClick={() => {
                  newSession();
                  setSessionsOpen(false);
                }}
              >
                ＋ 新对话
              </button>
              <div className="rail-sessions">
                <SessionList
                  sessions={sessions}
                  currentSessionId={currentSessionId}
                  onSelect={(sessionId) => {
                    void switchSession(sessionId);
                    setSessionsOpen(false);
                  }}
                  onDelete={(sessionId) => void deleteSession(sessionId)}
                />
                {sessions.length === 0 && <p className="profile-hint">还没有历史会话。</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
