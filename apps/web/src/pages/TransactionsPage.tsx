import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api/client.js";
import type { TransactionDto } from "../api/types.js";
import { catEmoji, fmt } from "../utils/format.js";

export interface TransactionsPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
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

/** 账单页：统计条 + 搜索/分类筛选 + 按日分组 + 展开明细 */
export function TransactionsPage({ active, refreshKey }: TransactionsPageProps) {
  const [transactions, setTransactions] = useState<readonly TransactionDto[]>([]);
  const [category, setCategory] = useState("全部");
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const txns = await api.transactions("");
      setTransactions(txns.transactions);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

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

  const totalExpense = transactions
    .filter((txn) => txn.type === "EXPENSE")
    .reduce((sum, txn) => sum + txn.amount, 0);
  const totalIncome = transactions
    .filter((txn) => txn.type === "INCOME")
    .reduce((sum, txn) => sum + txn.amount, 0);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">TRANSACTIONS · 全部流水</p>
          <h2 className="page-title">账单</h2>
          <p className="page-desc">每笔记录都能回到它被说出来的那句话。</p>
        </div>
        <span className="badge ink">共 {transactions.length} 笔</span>
      </div>

      <div className="bill-top">
        <div className="bill-stat">
          <div className="k">全部支出</div>
          <div className="v num">
            ¥{fmt(totalExpense)}
            <small>{transactions.filter((t) => t.type === "EXPENSE").length} 笔</small>
          </div>
        </div>
        <div className="bill-stat income">
          <div className="k">全部收入</div>
          <div className="v num">
            +¥{fmt(totalIncome)}
            <small>{transactions.filter((t) => t.type === "INCOME").length} 笔</small>
          </div>
        </div>
        <div className="bill-stat">
          <div className="k">期间结余</div>
          <div className="v num">
            ¥{fmt(totalIncome - totalExpense)}
            <small>收入 − 支出</small>
          </div>
        </div>
      </div>

      <div className="filters">
        <div className="filters-top">
          <label className="search">
            <span>🔎</span>
            <input
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
          </label>
          <span className="badge ink">{filtered.length} 条结果</span>
        </div>
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
          <div className="empty-title">没有符合条件的记录</div>
          <p className="empty-desc">换个关键词，或清除筛选看全部流水。</p>
          <button
            className="btn-secondary"
            type="button"
            onClick={() => {
              setKeyword("");
              setCategory("全部");
            }}
          >
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
                    {dayIncome > 0
                      ? `当日收入 +¥${fmt(dayIncome)}`
                      : `当日支出 ¥${fmt(dayExpense)}`}
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
                            <span className="q-k">原始备注 / NOTE</span>“{txn.note ?? "（无备注）"}”
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
                            <div className="detail-cell">
                              <div className="k">录入方式</div>
                              <div className="v">自然语言</div>
                            </div>
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
    </div>
  );
}
