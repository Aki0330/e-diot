import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import type { TransactionDto } from "../api/types.js";
import { Modal } from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { catEmoji, fmt } from "../utils/format.js";

export interface TransactionsPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

interface RangeFilter {
  readonly from: string;
  readonly to: string;
  readonly min: string;
  readonly max: string;
}

const EMPTY_FILTER: RangeFilter = { from: "", to: "", min: "", max: "" };

type Preset = "all" | "7d" | "month" | "lastMonth" | "custom";

const PRESETS: readonly { id: Preset; label: string }[] = [
  { id: "7d", label: "近 7 天" },
  { id: "month", label: "本月" },
  { id: "lastMonth", label: "上月" },
  { id: "all", label: "全部" },
];

interface TxForm {
  readonly type: "EXPENSE" | "INCOME";
  readonly amount: string;
  readonly category: string;
  readonly note: string;
  readonly time: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 快捷时间段：只算前端日期，接口参数保持不变 */
function presetRange(kind: "7d" | "month" | "lastMonth"): RangeFilter {
  const now = new Date();
  if (kind === "7d") {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from: isoDate(from), to: isoDate(now), min: "", max: "" };
  }
  if (kind === "month") {
    return {
      from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      min: "",
      max: "",
    };
  }
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    min: "",
    max: "",
  };
}

function keyOf(iso: string | null): string {
  if (iso === null) return "unknown";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "unknown" : isoDate(date);
}

function labelOf(key: string): string {
  if (key === "unknown") return "未知日期";
  const [, month, day] = key.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function weekdayOf(key: string): string {
  if (key === "unknown") return "";
  return (
    ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
      new Date(`${key}T00:00:00`).getDay()
    ] ?? ""
  );
}

function timeOf(iso: string | null): string {
  if (iso === null) return "--:--";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "--:--"
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalInput(iso: string | null): string {
  const date = iso === null ? new Date() : new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 账单页：搜索 + 快捷时间段 + 高级筛选 + 手动新增/编辑/删除 */
export function TransactionsPage({ active, refreshKey }: TransactionsPageProps) {
  const toast = useToast();
  const [transactions, setTransactions] = useState<readonly TransactionDto[]>([]);
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<RangeFilter>(EMPTY_FILTER);
  const [applied, setApplied] = useState<RangeFilter>(EMPTY_FILTER);
  const [preset, setPreset] = useState<Preset>("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDto | null>(null);
  const [form, setForm] = useState<TxForm>({
    type: "EXPENSE",
    amount: "",
    category: "",
    note: "",
    time: toLocalInput(null),
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const response = await api.transactions({
        limit: 100,
        ...(applied.from === "" ? {} : { from: applied.from }),
        ...(applied.to === "" ? {} : { to: applied.to }),
        ...(applied.min === "" ? {} : { minAmount: applied.min }),
        ...(applied.max === "" ? {} : { maxAmount: applied.max }),
      });
      setTransactions(response.transactions);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [applied]);

  useEffect(() => {
    if (active) void load();
  }, [active, refreshKey, load]);

  const categories = useMemo(
    () => ["全部", ...new Set(transactions.map((txn) => txn.category))],
    [transactions],
  );

  const filtered = transactions.filter((txn) => {
    const kw = keyword.trim();
    return (
      (category === "全部" || txn.category === category) &&
      (kw === "" ||
        txn.category.includes(kw) ||
        (txn.note ?? "").includes(kw) ||
        String(txn.amount).includes(kw))
    );
  });

  const groups: { key: string; items: TransactionDto[] }[] = [];
  filtered.forEach((txn) => {
    const key = keyOf(txn.transaction_time);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) last.items.push(txn);
    else groups.push({ key, items: [txn] });
  });

  const totalExpense = filtered
    .filter((txn) => txn.type === "EXPENSE")
    .reduce((sum, txn) => sum + txn.amount, 0);
  const totalIncome = filtered
    .filter((txn) => txn.type === "INCOME")
    .reduce((sum, txn) => sum + txn.amount, 0);
  const expenseCount = filtered.filter((txn) => txn.type === "EXPENSE").length;
  const incomeCount = filtered.filter((txn) => txn.type === "INCOME").length;

  const activeFilters =
    (applied.from !== "" || applied.to !== "" ? 1 : 0) +
    (applied.min !== "" || applied.max !== "" ? 1 : 0);

  const choosePreset = (next: Preset): void => {
    setPreset(next);
    if (next === "all") {
      setDraft(EMPTY_FILTER);
      setApplied(EMPTY_FILTER);
      return;
    }
    if (next === "custom") return;
    const range = presetRange(next);
    setDraft(range);
    setApplied(range);
  };

  const resetAll = (): void => {
    setKeyword("");
    setCategory("全部");
    setPreset("all");
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
  };

  const openCreate = (): void => {
    setEditing(null);
    setForm({
      type: "EXPENSE",
      amount: "",
      category: "",
      note: "",
      time: toLocalInput(null),
    });
    setFormOpen(true);
  };

  const openEdit = (txn: TransactionDto): void => {
    setEditing(txn);
    setForm({
      type: txn.type === "INCOME" ? "INCOME" : "EXPENSE",
      amount: String(txn.amount),
      category: txn.category,
      note: txn.note ?? "",
      time: toLocalInput(txn.transaction_time),
    });
    setFormOpen(true);
  };

  const saveForm = async (): Promise<void> => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("请输入有效金额");
    const categoryName = form.category.trim();
    if (categoryName === "") throw new Error("请填写分类");
    const payload = {
      amount,
      type: form.type,
      category: categoryName,
      note: form.note.trim() === "" ? null : form.note.trim(),
      transaction_time: new Date(form.time).toISOString(),
    };
    if (editing === null) {
      await api.createTransaction(payload);
      // 正反馈：告诉用户「今天已经记了几笔」，而不是干巴巴一句成功
      const todayKey = isoDate(new Date());
      const todayCount =
        transactions.filter((txn) => keyOf(txn.transaction_time) === todayKey).length + 1;
      toast(`记好了 · 今天第 ${todayCount} 笔`, "success");
    } else {
      await api.updateTransaction(editing.transaction_id, payload);
      toast("已经改好了", "success");
    }
    setFormOpen(false);
    await load();
  };

  const remove = async (txn: TransactionDto): Promise<void> => {
    if (!window.confirm(`删除这笔「${txn.note ?? txn.category}」？`)) return;
    try {
      await api.deleteTransaction(txn.transaction_id);
      await load();
      toast("这笔已删除", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  return (
    <div className="page tx-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">TRANSACTIONS · 全部流水</p>
          <h2 className="page-title">账单</h2>
          <p className="page-desc">每一笔都能翻到当时的原始备注，记错了也能随时改。</p>
        </div>
        <div className="head-side">
          <button className="btn-primary" onClick={openCreate}>
            ＋ 记一笔
          </button>
        </div>
      </div>

      <div className="stat-row">
        <div className="stat-tile">
          <span className="st-ico">💸</span>
          <div>
            <div className="st-k">支出</div>
            <div className="st-v num">¥{fmt(totalExpense)}</div>
          </div>
          <span className="st-n">{expenseCount} 笔</span>
        </div>
        <div className="stat-tile income">
          <span className="st-ico">💰</span>
          <div>
            <div className="st-k">收入</div>
            <div className="st-v num">+¥{fmt(totalIncome)}</div>
          </div>
          <span className="st-n">{incomeCount} 笔</span>
        </div>
        <div className="stat-tile">
          <span className="st-ico">⚖️</span>
          <div>
            <div className="st-k">结余</div>
            <div className="st-v num">¥{fmt(totalIncome - totalExpense)}</div>
          </div>
          <span className="st-n">收入 − 支出</span>
        </div>
      </div>

      <div className="filter-shell">
        <div className="filter-bar">
          <label className="search">
            <span className="search-ico">🔎</span>
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜备注、分类或金额"
              aria-label="搜索交易"
            />
            {keyword !== "" && (
              <button className="btn-text" type="button" onClick={() => setKeyword("")}>
                清除
              </button>
            )}
          </label>

          <button
            type="button"
            className={`filter-toggle${panelOpen ? " on" : ""}`}
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
          >
            ⚙︎ 日期与金额
            {activeFilters > 0 && <b className="ft-count">{activeFilters}</b>}
          </button>

          <span className="filter-result">{filtered.length} 条</span>
        </div>

        <div className="chip-row">
          {PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip${preset === item.id ? " on" : ""}`}
              onClick={() => choosePreset(item.id)}
            >
              {item.label}
            </button>
          ))}
          {preset === "custom" && <span className="chip on">自定义</span>}
        </div>

        {panelOpen && (
          <div className="filter-panel">
            <div className="filter-grid">
              <label>
                开始日期
                <input
                  type="date"
                  value={draft.from}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                />
              </label>
              <label>
                结束日期
                <input
                  type="date"
                  value={draft.to}
                  onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                />
              </label>
              <label>
                最低金额
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={draft.min}
                  onChange={(event) => setDraft({ ...draft, min: event.target.value })}
                />
              </label>
              <label>
                最高金额
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="不限"
                  value={draft.max}
                  onChange={(event) => setDraft({ ...draft, max: event.target.value })}
                />
              </label>
            </div>
            <div className="filter-actions">
              <button
                className="btn-primary btn-sm"
                type="button"
                onClick={() => {
                  setApplied({ ...draft });
                  setPreset("custom");
                }}
              >
                应用
              </button>
              <button className="btn-ghost btn-sm" type="button" onClick={resetAll}>
                重置
              </button>
            </div>
          </div>
        )}

        <div className="cat-filter">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={`chip${category === name ? " on" : ""}`}
              onClick={() => setCategory(name)}
            >
              {name}
              <span className="ct">
                {name === "全部"
                  ? transactions.length
                  : transactions.filter((txn) => txn.category === name).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error !== null && <p className="profile-hint error">{error}</p>}

      {groups.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔍</div>
          <div className="empty-title">这里还没有符合条件的记录</div>
          <p className="empty-desc">换个时间段看看，或者清掉筛选。</p>
          <button className="btn-secondary" type="button" onClick={resetAll}>
            清除筛选
          </button>
        </div>
      ) : (
        <div className="groups">
          {groups.map((group) => {
            const dayExpense = group.items
              .filter((txn) => txn.type === "EXPENSE")
              .reduce((sum, txn) => sum + txn.amount, 0);
            const dayIncome = group.items
              .filter((txn) => txn.type === "INCOME")
              .reduce((sum, txn) => sum + txn.amount, 0);
            return (
              <section className="daygroup" key={group.key}>
                <div className="day-head">
                  <div className="day-date">
                    {labelOf(group.key)}
                    <span className="day-week">{weekdayOf(group.key)}</span>
                    <span className="badge ink tiny">{group.items.length} 笔</span>
                  </div>
                  <span className="day-total">
                    {dayIncome > 0 ? `收入 +¥${fmt(dayIncome)}` : `支出 ¥${fmt(dayExpense)}`}
                  </span>
                </div>

                {group.items.map((txn) => {
                  const isIncome = txn.type === "INCOME";
                  const open = expanded === txn.transaction_id;
                  return (
                    <div className={`trow${open ? " open" : ""}`} key={txn.transaction_id}>
                      <button
                        className="trow-btn"
                        type="button"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : txn.transaction_id)}
                      >
                        <div className="icon-tile">{catEmoji(txn.category)}</div>
                        <div className="trow-main">
                          <div className="trow-name">
                            {txn.note ?? txn.category}
                            <span className="badge ink tiny">{txn.category}</span>
                          </div>
                          <div className="trow-meta">
                            {timeOf(txn.transaction_time)} · {isIncome ? "收入" : "支出"}
                          </div>
                        </div>
                        <div className={`trow-amt${isIncome ? " income" : ""}`}>
                          <span className="sign">{isIncome ? "+" : "-"}</span>¥{fmt(txn.amount)}
                          <span className="trow-chev">{open ? "▴" : "▾"}</span>
                        </div>
                      </button>

                      {open && (
                        <div className="trow-detail">
                          <div className="detail-quote">
                            <span className="q-k">原始备注</span>“{txn.note ?? "（没有备注）"}”
                          </div>
                          <div className="detail-grid">
                            <div className="detail-cell">
                              <div className="k">分类</div>
                              <div className="v">
                                {catEmoji(txn.category)} {txn.category}
                              </div>
                            </div>
                            <div className="detail-cell">
                              <div className="k">金额</div>
                              <div className="v">
                                {isIncome ? "+" : "-"}¥{fmt(txn.amount)}
                              </div>
                            </div>
                            <div className="detail-cell">
                              <div className="k">时间</div>
                              <div className="v">
                                {labelOf(keyOf(txn.transaction_time))}{" "}
                                {timeOf(txn.transaction_time)}
                              </div>
                            </div>
                            <div className="detail-cell">
                              <div className="k">录入方式</div>
                              <div className="v">手动 / 对话</div>
                            </div>
                          </div>
                          <div className="tx-actions">
                            <button className="memory-btn" onClick={() => openEdit(txn)}>
                              编辑
                            </button>
                            <button className="memory-btn danger" onClick={() => void remove(txn)}>
                              删除
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}

      {formOpen && (
        <Modal
          title={editing === null ? "记一笔" : "改这一笔"}
          onClose={() => setFormOpen(false)}
          onConfirm={saveForm}
          confirmLabel={editing === null ? "记好了" : "保存修改"}
        >
          <div className="form-group">
            <label>类型</label>
            <select
              value={form.type}
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as "EXPENSE" | "INCOME" })
              }
            >
              <option value="EXPENSE">支出</option>
              <option value="INCOME">收入</option>
            </select>
          </div>
          <div className="form-group">
            <label>金额</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="如 35.50"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label>分类</label>
            <input
              list="tx-categories"
              placeholder="如 餐饮"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
            />
            <datalist id="tx-categories">
              {categories
                .filter((name) => name !== "全部")
                .map((name) => (
                  <option key={name} value={name} />
                ))}
            </datalist>
          </div>
          <div className="form-group">
            <label>备注</label>
            <input
              placeholder="可选，写下来更好找"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label>时间</label>
            <input
              type="datetime-local"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
