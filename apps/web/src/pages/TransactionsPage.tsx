import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { TransactionsResponse } from "../api/types.js";
import { catEmoji, fmt, fmtDate } from "../utils/format.js";

export interface TransactionsPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

/** 账单页（对应旧 initTransactionsPage / fillTransactionsData） */
export function TransactionsPage({ active, refreshKey }: TransactionsPageProps) {
  const [category, setCategory] = useState("");
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedCategory: string): Promise<void> => {
    try {
      setData(await api.transactions(selectedCategory));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (active) void load(category);
  }, [active, category, refreshKey, load]);

  const categories = data === null ? [] : [...new Set(data.transactions.map((tx) => tx.category))];

  return (
    <div className="tx-page">
      <div className="tx-filter-chips">
        <button
          className={`tx-filter-chip${category === "" ? " active" : ""}`}
          onClick={() => setCategory("")}
        >
          全部
        </button>
        {categories.map((item) => (
          <button
            key={item}
            className={`tx-filter-chip${category === item ? " active" : ""}`}
            onClick={() => setCategory(item)}
          >
            {catEmoji(item)} {item}
          </button>
        ))}
      </div>

      <div className="tx-list">
        {error !== null && data === null ? (
          <div className="empty-state">
            <div className="empty-emoji">😵</div>
            <div className="empty-text">加载失败: {error}</div>
          </div>
        ) : data === null ? (
          <div className="spinner" />
        ) : data.transactions.length > 0 ? (
          data.transactions.map((tx) => (
            <div key={tx.transaction_id} className="tx-item">
              <div className="tx-icon">{catEmoji(tx.category)}</div>
              <div className="tx-info">
                <div className="tx-cat">{tx.category}</div>
                <div className="tx-meta">
                  {tx.note ?? ""} · {fmtDate(tx.transaction_time)}
                </div>
              </div>
              <div className={`tx-amount ${(tx.type ?? "EXPENSE").toLowerCase()}`}>
                {tx.type === "EXPENSE" ? "-" : "+"}¥{fmt(tx.amount)}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <div className="empty-emoji">📭</div>
            <div className="empty-text">
              还没有交易记录
              <br />
              去AI助手页面记账吧
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
