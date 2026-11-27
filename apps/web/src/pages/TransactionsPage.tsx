import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moneySum } from "@cyberbudget/shared/money";

import { api } from "../api/client.js";
import type { TransactionDto } from "../api/types.js";
import { Modal } from "../components/Modal.js";
import { useToast } from "../components/Toast.js";
import { catEmoji } from "../utils/format.js";
import { ledgerAmount as fmt, ledgerCents } from "../utils/ledger.js";

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

function sumTransactions(items: readonly TransactionDto[], type: "EXPENSE" | "INCOME") {
  return moneySum(items.filter((txn) => txn.type === type).map((txn) => txn.amount));
}

interface TxForm {
  readonly type: "EXPENSE" | "INCOME";
  readonly amount: string;
  readonly category: string;
  readonly note: string;
  readonly time: string;
}

function keyOf(iso: string | null): string {
  if (iso === null) return "unknown";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "unknown"
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function toLocalInput(iso: string | null): string {
  const date = iso === null ? new Date() : new Date(iso);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 账单页：统计 + 筛选（日期/金额/分类/关键词）+ 手动新增/编辑/删除 */
export function TransactionsPage({ active, refreshKey }: TransactionsPageProps) {
  const toast = useToast();
  const [transactions, setTransactions] = useState<readonly TransactionDto[]>([]);
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("");
  const [draft, setDraft] = useState<RangeFilter>(EMPTY_FILTER);
  const [applied, setApplied] = useState<RangeFilter>(EMPTY_FILTER);
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
  const [loading, setLoading] = useState(true);
  const lastRequest = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const request = ++lastRequest.current;
    setLoading(true);
    setError(null);
    try {
      const response = await api.transactions({
        limit: 100,
        ...(applied.from === "" ? {} : { from: applied.from }),
        ...(applied.to === "" ? {} : { to: applied.to }),
        ...(applied.min === "" ? {} : { minAmount: applied.min }),
        ...(applied.max === "" ? {} : { maxAmount: applied.max }),
      });
      if (request === lastRequest.current) setTransactions(response.transactions);
    } catch (cause) {
      if (request === lastRequest.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === lastRequest.current) setLoading(false);
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
  const hasFilters =
    keyword.trim() !== "" || category !== "全部" || Object.values(applied).some(Boolean);
  function resetFilters(): void {
    setKeyword("");
    setCategory("全部");
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
  }

  const groups: { key: string; items: TransactionDto[] }[] = [];
  filtered.forEach((txn) => {
    const key = keyOf(txn.transaction_time);
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) last.items.push(txn);
    else groups.push({ key, items: [txn] });
  });

  const totalExpense = sumTransactions(filtered, "EXPENSE");
  const totalIncome = sumTransactions(filtered, "INCOME");

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
      toast("账单已新增", "success");
    } else {
      await api.updateTransaction(editing.transaction_id, payload);
      toast("账单已更新", "success");
    }
    setFormOpen(false);
    await load();
  };

  const remove = async (txn: TransactionDto): Promise<void> => {
    if (!window.confirm(`删除这笔「${txn.note ?? txn.category}」？`)) return;
    try {
      await api.deleteTransaction(txn.transaction_id);
      await load();
      toast("账单已删除", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : String(cause), "error");
    }
  };

  return (
    <div className="page ledger-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">账单</h2>
          <p className="ledger-period">统计当前列表中的收支，最多显示 100 笔。</p>
        </div>
        <div className="head-side">
          <button className="btn-primary" onClick={openCreate}>
            新增账单
          </button>
        </div>
      </div>

      <div className="bill-top">
        <div className="bill-stat">
          <div className="k">筛选支出</div>
          <div className="v num">
            ¥{ledgerCents(totalExpense)}
            <small>{filtered.filter((t) => t.type === "EXPENSE").length} 笔</small>
          </div>
        </div>
        <div className="bill-stat income">
          <div className="k">筛选收入</div>
          <div className="v num">
            +¥{ledgerCents(totalIncome)}
            <small>{filtered.filter((t) => t.type === "INCOME").length} 笔</small>
          </div>
        </div>
        <div className="bill-stat">
          <div className="k">结余</div>
          <div className="v num">
            ¥{ledgerCents(totalIncome - totalExpense)}
            <small>收入 − 支出</small>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filters-top">
          <div className="search">
            <input
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索分类、备注或金额"
              aria-label="搜索交易"
            />
            {keyword !== "" && (
              <button className="btn-text" type="button" onClick={() => setKeyword("")}>
                清除
              </button>
            )}
          </div>
          <span className="ledger-count" aria-live="polite">
            {loading ? "正在加载" : `${filtered.length} 笔`}
          </span>
        </div>

        <form
          className="filter-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ ...draft });
          }}
        >
          <label>
            开始日期
            <input
              type="date"
              max={draft.to || undefined}
              value={draft.from}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              min={draft.from || undefined}
              value={draft.to}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </label>
          <label>
            最低金额
            <input
              type="number"
              min="0"
              max={draft.max || undefined}
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
              min={draft.min || "0"}
              step="0.01"
              placeholder="不限"
              value={draft.max}
              onChange={(event) => setDraft({ ...draft, max: event.target.value })}
            />
          </label>
          <div className="filter-actions">
            <button className="btn-primary" type="submit">
              应用筛选
            </button>
            <button className="memory-btn" type="button" onClick={resetFilters}>
              重置
            </button>
          </div>
        </form>

        <div className="cat-filter">
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
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

      {error !== null ? (
        <div className="empty">
          <p role="alert">{error}</p>
          <button className="btn-secondary" onClick={() => void load()}>
            重新加载
          </button>
        </div>
      ) : loading ? (
        <p className="ledger-empty" role="status">
          正在加载账单…
        </p>
      ) : groups.length === 0 ? (
        <div className="empty">
          <div className="empty-title">{hasFilters ? "没有符合条件的记录" : "还没有账单"}</div>
          <button
            className="btn-secondary"
            type="button"
            onClick={hasFilters ? resetFilters : openCreate}
          >
            {hasFilters ? "清除筛选" : "记第一笔账"}
          </button>
        </div>
      ) : (
        <div className="groups">
          {groups.map((group) => {
            const dayExpense = sumTransactions(group.items, "EXPENSE");
            const dayIncome = sumTransactions(group.items, "INCOME");
            return (
              <section className="daygroup" key={group.key}>
                <div className="day-head">
                  <div className="day-date">
                    {labelOf(group.key)}
                    <span className="day-week">{weekdayOf(group.key)}</span>
                    <span className="badge ink tiny">{group.items.length} 笔</span>
                  </div>
                  <span className="day-total">
                    {dayExpense > 0n && <span>支出 ¥{ledgerCents(dayExpense)}</span>}
                    {dayIncome > 0n && <span>收入 ¥{ledgerCents(dayIncome)}</span>}
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
                        <div style={{ minWidth: 0 }}>
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
                            <span className="q-k">备注</span>
                            {txn.note ?? "无备注"}
                          </div>
                          <div className="detail-grid">
                            <div className="detail-cell">
                              <div className="k">识别分类</div>
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
          title={editing === null ? "新增账单" : "编辑账单"}
          onClose={() => setFormOpen(false)}
          onConfirm={saveForm}
          confirmLabel={editing === null ? "保存账单" : "保存修改"}
        >
          <div className="form-group">
            <label htmlFor="tx-kind">类型</label>
            <select
              id="tx-kind"
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
            <label htmlFor="tx-amount">金额（元）</label>
            <input
              id="tx-amount"
              type="number"
              min="0"
              step="0.01"
              placeholder="如 35.50"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="tx-category">分类</label>
            <input
              id="tx-category"
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
            <label htmlFor="tx-note">备注</label>
            <input
              id="tx-note"
              placeholder="可选"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="tx-time">时间</label>
            <input
              id="tx-time"
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
