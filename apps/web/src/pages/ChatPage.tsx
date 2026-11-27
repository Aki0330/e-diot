import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { api } from "../api/client.js";
import type { ChatResponse, SessionItem } from "../api/types.js";
import { useToast } from "../components/Toast.js";
import { INTENT_LABELS, formatContent } from "../utils/format.js";
import { chatViewReducer, emptyChatView, submitsChat } from "./chat-state.js";
import "./chat.css";

const EXAMPLES = [
  { label: "记一笔支出", draft: "午餐花了 35 元" },
  { label: "查本月预算", draft: "这个月还剩多少预算？" },
  { label: "分配分类预算", draft: "把本月交通预算设为 300 元" },
];

function sessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

interface HistoryProps {
  readonly sessions: readonly SessionItem[];
  readonly selected: string | null;
  readonly status: "loading" | "ready" | "error";
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onRetry: () => void;
}

function History({ sessions, selected, status, onSelect, onDelete, onRetry }: HistoryProps) {
  return (
    <>
      {status === "error" && (
        <p role="alert" className="lc-history-note">
          历史记录加载失败。<button onClick={onRetry}>重新加载</button>
        </p>
      )}
      {sessions.length === 0 && status !== "error" && (
        <p className="lc-history-note">
          {status === "loading" ? "正在读取对话…" : "发送第一条消息后，对话会保存在这里。"}
        </p>
      )}
      <ul className="lc-sessions">
        {sessions.map((session) => {
          const title = session.title || "未命名对话";
          return (
            <li
              key={session.session_id}
              className={selected === session.session_id ? "is-current" : ""}
            >
              <button
                type="button"
                className="lc-select"
                aria-current={selected === session.session_id ? "true" : undefined}
                onClick={() => onSelect(session.session_id)}
              >
                <span>{title}</span>
                <time dateTime={session.updated_at}>{sessionDate(session.updated_at)}</time>
              </button>
              <button
                type="button"
                className="lc-remove"
                aria-label={"删除对话「" + title + "」"}
                title={"删除对话「" + title + "」"}
                onClick={() => onDelete(session.session_id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export interface ChatPageProps {
  readonly active: boolean;
  readonly sidebarCollapsed?: boolean;
  readonly onDataChanged: () => void;
}

export function ChatPage({ active, onDataChanged }: ChatPageProps) {
  const toast = useToast();
  const [sessions, setSessions] = useState<readonly SessionItem[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryProps["status"]>("loading");
  const [view, dispatch] = useReducer(chatViewReducer, emptyChatView(0, null));
  const [draft, setDraft] = useState("");
  const [feedbackDone, setFeedbackDone] = useState<Record<number, string>>({});
  const input = useRef<HTMLTextAreaElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLDialogElement>(null);
  const selected = useRef({ version: 0, id: null as string | null });
  const listRequest = useRef(0);
  const requests = useRef(new Map<string | number, Promise<ChatResponse>>());
  const drafts = useRef(new Map<string | number, string>());

  const loadSessions = useCallback(async (): Promise<void> => {
    const request = ++listRequest.current;
    try {
      const data = await api.sessions();
      if (request !== listRequest.current) return;
      setSessions(data.sessions);
      setHistoryStatus("ready");
    } catch {
      if (request === listRequest.current) setHistoryStatus("error");
    }
  }, []);

  useEffect(() => {
    if (active) void loadSessions();
    else drawer.current?.close();
  }, [active, loadSessions]);

  useEffect(() => {
    if (active && messages.current) messages.current.scrollTop = messages.current.scrollHeight;
  }, [active, view.messages, view.status]);

  const select = async (id: string | null): Promise<void> => {
    drawer.current?.close();
    const version = selected.current.version + 1;
    selected.current = { version, id };
    dispatch({ type: "select", version, id });
    setDraft(drafts.current.get(id ?? version) ?? "");
    if (id === null) {
      input.current?.focus();
      return;
    }
    try {
      // 回到仍在发送的会话时，等待该笔请求落定，再读取完整的服务端记录。
      const pending = requests.current.get(id);
      if (pending) await Promise.allSettled([pending]);
      if (selected.current.version !== version) return;
      const detail = await api.sessionDetail(id);
      dispatch({
        type: "history",
        version,
        messages: detail.messages.map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          content: message.content,
          intentType: message.intent_type,
          graphPath: message.graph_path,
          messageId: message.message_id,
          isProactive: message.is_proactive ?? false,
        })),
      });
    } catch {
      dispatch({ type: "failure", version, error: "对话内容加载失败，请重新加载。" });
    }
  };

  const editDraft = (value: string): void => {
    const key = selected.current.id ?? selected.current.version;
    if (value) drafts.current.set(key, value);
    else drafts.current.delete(key);
    setDraft(value);
  };

  const send = async (): Promise<void> => {
    const content = draft.trim();
    const { version, id } = selected.current;
    const key = id ?? version;
    if (
      !content ||
      version !== view.version ||
      view.status !== "ready" ||
      requests.current.has(key)
    )
      return;
    const request = api.chat(content, id);
    requests.current.set(key, request);
    editDraft("");
    dispatch({ type: "send", version, content });
    try {
      const data = await request;
      if (selected.current.version === version) {
        selected.current = { version, id: data.session_id };
        if (id === null) {
          const nextDraft = drafts.current.get(key);
          if (nextDraft) drafts.current.set(data.session_id, nextDraft);
          drafts.current.delete(key);
        }
      }
      dispatch({
        type: "reply",
        version,
        id: data.session_id,
        message: {
          role: "assistant",
          content: data.response,
          intentType: data.intent_type,
          graphPath: data.graph_path,
        },
      });
      if (
        data.graph_path
          ?.split("→")
          .some((step) => step === "write_transaction" || step === "write_budget")
      )
        onDataChanged();
      void loadSessions();
    } catch (error) {
      const detail = error instanceof Error ? error.message : "网络连接异常";
      dispatch({
        type: "failure",
        version,
        error: "未收到回复（" + detail + "）。如有记账，请先核对账单再重试。",
      });
      void loadSessions();
    } finally {
      requests.current.delete(key);
    }
  };

  const deleteSession = async (id: string): Promise<void> => {
    if (!window.confirm("删除这个对话和其中的消息？")) return;
    try {
      await api.deleteSession(id);
      drafts.current.delete(id);
      if (selected.current.id === id) void select(null);
      void loadSessions();
    } catch {
      toast("对话删除失败，请重试", "error");
    }
  };

  const feedback = async (id: number, value: "helpful" | "inaccurate" | "mute"): Promise<void> => {
    try {
      await api.proactiveFeedback(id, value);
      setFeedbackDone((prev) => ({
        ...prev,
        [id]:
          value === "mute"
            ? "已暂停提醒 1 天"
            : value === "helpful"
              ? "已反馈有帮助"
              : "已反馈不准确",
      }));
    } catch (error) {
      toast(error instanceof Error ? error.message : "反馈未保存，请重试", "error");
    }
  };

  const history = (
    <History
      sessions={sessions}
      selected={view.id}
      status={historyStatus}
      onSelect={(id) => void select(id)}
      onDelete={(id) => void deleteSession(id)}
      onRetry={() => void loadSessions()}
    />
  );
  const empty = view.status === "ready" && !view.error && view.messages.length === 0;
  const title = sessions.find((item) => item.session_id === view.id)?.title;
  return (
    <section className="page ledger-chat" aria-label="对话记账">
      <header className="lc-heading">
        <h2>对话记账</h2>
        <div>
          <button
            type="button"
            className="lc-history-trigger"
            onClick={() => drawer.current?.showModal()}
          >
            历史
          </button>
          <button type="button" className="lc-new" onClick={() => void select(null)}>
            <span aria-hidden="true">＋</span> 新对话
          </button>
        </div>
      </header>
      <div className="lc-columns">
        <section className="lc-paper" aria-label={title || "当前对话"}>
          {view.id && <div className="lc-thread-title">{title || "历史对话"}</div>}
          <div className="lc-scroll" ref={messages}>
            {empty && (
              <div className="lc-empty">
                <div className="lc-book" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <h3>随手记一笔</h3>
                <p>写下金额和用途，或选个例子改成自己的。</p>
                <ul className="lc-examples" aria-label="填入输入框的示例">
                  {EXAMPLES.map((example) => (
                    <li key={example.label}>
                      <button
                        type="button"
                        onClick={() => {
                          editDraft(example.draft);
                          input.current?.focus();
                        }}
                      >
                        <strong>{example.label}</strong>
                        <span>{example.draft}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div
              className="lc-messages"
              role="log"
              aria-label="对话消息"
              aria-live="polite"
              aria-relevant="additions"
            >
              {view.messages.map((message, index) => (
                <article
                  key={message.messageId ?? "local-" + index}
                  className={"lc-message " + message.role}
                >
                  <span className="lc-speaker">
                    {message.role === "user" ? "你" : message.isProactive ? "预算提醒" : "记账助手"}
                  </span>
                  <div
                    className="lc-bubble"
                    dangerouslySetInnerHTML={{ __html: formatContent(message.content) }}
                  />
                  {message.role === "assistant" && message.graphPath && (
                    <details className="lc-trace">
                      <summary>查看处理记录</summary>
                      <p>
                        {message.intentType &&
                          (INTENT_LABELS[message.intentType] ?? message.intentType)}{" "}
                        {message.graphPath}
                      </p>
                    </details>
                  )}
                  {message.isProactive && message.messageId !== undefined && (
                    <div className="lc-feedback">
                      {feedbackDone[message.messageId] ??
                        (
                          [
                            ["helpful", "有帮助"],
                            ["inaccurate", "不准确"],
                            ["mute", "暂停提醒 1 天"],
                          ] as const
                        ).map(([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            onClick={() => {
                              if (message.messageId !== undefined)
                                void feedback(message.messageId, value);
                            }}
                          >
                            {label}
                          </button>
                        ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {view.status !== "ready" && (
              <p className="lc-progress" role="status">
                {view.status === "loading" ? "正在读取对话…" : "正在等待回复…"}
              </p>
            )}
            {view.error && (
              <div className="lc-error" role="alert">
                {view.error}{" "}
                {view.id && (
                  <button type="button" onClick={() => void select(view.id)}>
                    重新加载
                  </button>
                )}
              </div>
            )}
          </div>
          <form
            className="lc-compose"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="lc-input-box">
              <label htmlFor="chat-input">记账或提问</label>
              <textarea
                id="chat-input"
                ref={input}
                rows={2}
                value={draft}
                placeholder="例如：今天午餐花了 35 元"
                onChange={(event) => editDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (submitsChat(event.nativeEvent)) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                className="lc-send"
                type="submit"
                disabled={!draft.trim() || view.status !== "ready"}
              >
                发送 <span aria-hidden="true">↑</span>
              </button>
            </div>
          </form>
        </section>
        <aside className="lc-rail" aria-label="历史对话">
          <h3>历史对话</h3>
          {history}
        </aside>
      </div>
      <dialog
        className="lc-drawer"
        aria-label="历史对话"
        ref={drawer}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom
            )
              event.currentTarget.close();
          }
        }}
      >
        <div className="lc-drawer-head">
          <h3>历史对话</h3>
          <button type="button" onClick={() => drawer.current?.close()}>
            关闭
          </button>
        </div>
        {history}
      </dialog>
    </section>
  );
}
