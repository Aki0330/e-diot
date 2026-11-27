import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { MemoryBasis, MemoryItem, MemoryType } from "../api/types.js";
import { useToast } from "../components/Toast.js";

export interface MemoryPageProps {
  readonly active: boolean;
}

const TYPE_LABEL: Record<MemoryType, string> = {
  preference: "偏好",
  goal: "目标",
  habit: "习惯",
  boundary: "边界",
};

const TYPE_OPTIONS: readonly MemoryType[] = ["preference", "goal", "habit", "boundary"];

const SOURCE_LABEL: Record<MemoryItem["source"], string> = {
  conversation: "来自对话",
  transaction: "来自交易",
  manual: "手动添加",
};

function fmtDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN", { hour12: false });
}

/** 记忆页：待确认 / 已生效 / 查看依据 / 纠正 / 删除 */
export function MemoryPage({ active }: MemoryPageProps) {
  const toast = useToast();
  const [memories, setMemories] = useState<readonly MemoryItem[]>([]);
  const [newType, setNewType] = useState<MemoryType>("preference");
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [basisFor, setBasisFor] = useState<string | null>(null);
  const [basis, setBasis] = useState<MemoryBasis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await api.memories();
      setMemories(response.memories);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const create = async (): Promise<void> => {
    const content = newContent.trim();
    if (content === "") {
      toast("先写一条要记住的内容", "error");
      return;
    }
    setAdding(true);
    try {
      await api.createMemory({ type: newType, content });
      setNewContent("");
      await load();
      toast("已添加，确认后会参与回复", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    } finally {
      setAdding(false);
    }
  };

  const confirm = async (id: string): Promise<void> => {
    try {
      await api.confirmMemory(id);
      await load();
      toast("已记住，下次对话生效", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  const remove = async (id: string): Promise<void> => {
    if (!window.confirm("删除后这条记忆不再参与任何回复，确定？")) return;
    try {
      await api.deleteMemory(id);
      await load();
      if (basisFor === id) setBasisFor(null);
      toast("已删除", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  const startEdit = (memory: MemoryItem): void => {
    setEditingId(memory.id);
    setEditingText(memory.content);
  };

  const saveEdit = async (id: string): Promise<void> => {
    const content = editingText.trim();
    if (content === "") {
      toast("内容不能为空", "error");
      return;
    }
    try {
      await api.updateMemory(id, { content });
      setEditingId(null);
      await load();
      toast("已纠正", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  const toggleBasis = async (id: string): Promise<void> => {
    if (basisFor === id) {
      setBasisFor(null);
      return;
    }
    try {
      const response = await api.memoryBasis(id);
      setBasis(response);
      setBasisFor(id);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  const pending = memories.filter((memory) => memory.status === "pending");
  const activeList = memories.filter((memory) => memory.status === "active");

  function renderEditor(id: string) {
    if (editingId !== id) return null;
    return (
      <form
        className="memory-edit"
        onSubmit={(event) => {
          event.preventDefault();
          void saveEdit(id);
        }}
      >
        <input
          aria-label="修改记忆内容"
          value={editingText}
          onChange={(event) => setEditingText(event.target.value)}
          maxLength={500}
          autoFocus
        />
        <button className="memory-btn" type="submit">
          保存
        </button>
        <button className="memory-btn" type="button" onClick={() => setEditingId(null)}>
          取消
        </button>
      </form>
    );
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">我的记忆</h2>
          <p className="page-desc">管理记账助手在对话中使用的偏好、习惯和目标。</p>
        </div>
        <span className="badge ink">
          {activeList.length} 条生效 · {pending.length} 条待确认
        </span>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">新增记忆</div>
            <div className="card-sub">新增后先进入待确认，确认后才会参与回复</div>
          </div>
        </div>
        <div className="memory-form">
          <select
            aria-label="记忆类型"
            value={newType}
            onChange={(event) => setNewType(event.target.value as MemoryType)}
          >
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          <input
            aria-label="新记忆内容"
            value={newContent}
            onChange={(event) => setNewContent(event.target.value)}
            placeholder="例如：喜欢奶茶，通常点少糖"
            maxLength={500}
          />
          <button className="btn-primary" onClick={() => void create()} disabled={adding}>
            {adding ? "添加中..." : "添加"}
          </button>
        </div>
      </section>

      {pending.length > 0 && (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <div>
              <div className="card-title">待确认</div>
              <div className="card-sub">确认后才会用于调整回复</div>
            </div>
            <span className="badge amber">{pending.length} 条</span>
          </div>
          <div className="memory-list">
            {pending.map((memory) => (
              <div className="memory-item" key={memory.id}>
                <div className="memory-main">
                  <div className="memory-content">{memory.content}</div>
                  <div className="memory-meta">
                    <span className="badge ink tiny">{TYPE_LABEL[memory.type]}</span>
                    <span>{SOURCE_LABEL[memory.source]}</span>
                    <span>{fmtDateTime(memory.updated_at)}</span>
                  </div>
                  {renderEditor(memory.id)}
                </div>
                <div className="memory-actions">
                  <button
                    className="btn-primary memory-btn"
                    onClick={() => void confirm(memory.id)}
                  >
                    确认记住
                  </button>
                  <button className="memory-btn" onClick={() => startEdit(memory)}>
                    修改
                  </button>
                  <button className="memory-btn danger" onClick={() => void remove(memory.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <div>
            <div className="card-title">已生效</div>
            <div className="card-sub">按类型优先级参与回复：边界 &gt; 目标 &gt; 偏好 &gt; 习惯</div>
          </div>
          <span className="badge lime">{activeList.length} 条</span>
        </div>

        {activeList.length === 0 ? (
          <div className="empty" style={{ border: 0, boxShadow: "none" }}>
            <div className="empty-icon">🧠</div>
            <div className="empty-title">还没有生效的记忆</div>
            <p className="empty-desc">在上方添加一条，确认后 E-diot 会在相关对话里自然使用。</p>
          </div>
        ) : (
          <div className="memory-list">
            {activeList.map((memory) => (
              <div className="memory-item" key={memory.id}>
                <div className="memory-main">
                  <div className="memory-content">{memory.content}</div>
                  <div className="memory-meta">
                    <span className="badge ink tiny">{TYPE_LABEL[memory.type]}</span>
                    <span>{SOURCE_LABEL[memory.source]}</span>
                    <span>更新于 {fmtDateTime(memory.updated_at)}</span>
                  </div>

                  {renderEditor(memory.id)}

                  {basisFor === memory.id && basis !== null && (
                    <div className="memory-basis">
                      <span className="k">记忆来源</span>
                      {basis.note !== null && <div>{basis.note}</div>}
                      {basis.transaction !== null && (
                        <div>
                          交易：{basis.transaction.type === "EXPENSE" ? "-" : "+"}¥
                          {basis.transaction.amount} · {basis.transaction.category}
                          {basis.transaction.note !== null ? ` · ${basis.transaction.note}` : ""}
                        </div>
                      )}
                      {basis.message !== null && (
                        <div>
                          对话：{basis.message.role === "user" ? "你说" : "E-diot 说"}「
                          {basis.message.content.slice(0, 120)}」
                          <br />
                          {fmtDateTime(basis.message.created_at)}
                        </div>
                      )}
                      {basis.note === null &&
                        basis.transaction === null &&
                        basis.message === null && (
                          <div>来源：{SOURCE_LABEL[basis.source]}（暂无关联记录）</div>
                        )}
                    </div>
                  )}
                </div>

                <div className="memory-actions">
                  <button className="memory-btn" onClick={() => void toggleBasis(memory.id)}>
                    {basisFor === memory.id ? "收起依据" : "查看依据"}
                  </button>
                  <button className="memory-btn" onClick={() => startEdit(memory)}>
                    纠正
                  </button>
                  <button className="memory-btn danger" onClick={() => void remove(memory.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error !== null && <p className="profile-hint error">{error}</p>}
    </div>
  );
}
