import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { DashboardData, TransactionDto } from "../api/types.js";
import { catEmoji, fmt } from "../utils/format.js";

function TxMiniItem({ tx }: { readonly tx: TransactionDto }) {
  return (
    <div className="tx-mini-item">
      <div className="tx-mini-icon">{catEmoji(tx.category)}</div>
      <div className="tx-mini-info">
        <div className="tx-mini-cat">{tx.category}</div>
        <div className="tx-mini-note">{tx.note ?? ""}</div>
      </div>
      <div className={`tx-mini-amount ${(tx.type ?? "EXPENSE").toLowerCase()}`}>
        {tx.type === "EXPENSE" ? "-" : "+"}¥{fmt(tx.amount)}
      </div>
    </div>
  );
}

export interface DashboardPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

/** 总览页（对应旧 initDashboardPage / fillDashboardData） */
export function DashboardPage({ active, refreshKey }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, refreshKey, load]);

  if (error !== null && data === null) {
    return (
      <div className="dashboard-page">
        <div className="empty-state">
          <div className="empty-emoji">😵</div>
          <div className="empty-text">加载失败: {error}</div>
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="dashboard-page">
        <div className="summary-cards">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const usedPercent =
    data.total_budget > 0 ? Math.round((Math.max(data.remaining, 0) / data.total_budget) * 100) : 0;

  return (
    <div className="dashboard-page">
      <div className="summary-cards">
        <div className="summary-card full-width accent">
          <div className="card-label">月度总预算</div>
          <div className="card-value">¥{fmt(data.total_budget)}</div>
          <div className="card-icon-bg">💰</div>
        </div>
        <div className="summary-card success">
          <div className="card-label">本月收入</div>
          <div className="card-value">¥{fmt(data.total_income)}</div>
          <div className="card-icon-bg">📈</div>
        </div>
        <div className="summary-card">
          <div className="card-label">本月支出</div>
          <div
            className="card-value"
            style={{ color: data.total_spent > data.total_budget ? "var(--danger)" : "" }}
          >
            ¥{fmt(data.total_spent)}
          </div>
          <div className="card-icon-bg">💸</div>
        </div>
        <div className="summary-card warning">
          <div className="card-label">剩余可用</div>
          <div className="card-value">¥{fmt(data.remaining)}</div>
          <div className="card-sub">{usedPercent}%</div>
          <div className="card-icon-bg">🎯</div>
        </div>
      </div>

      <div className="section">
        {data.categories.length > 0 && (
          <>
            <div className="section-header">
              <span className="section-title">分类支出</span>
            </div>
            <div className="category-list">
              {data.categories.map((category) => (
                <div key={category.category} className="category-item">
                  <div className="cat-header">
                    <span className="cat-name">
                      {catEmoji(category.category)} {category.category}
                    </span>
                    <span className="cat-amounts">
                      ¥{fmt(category.spent)} / ¥{fmt(category.budget)}
                    </span>
                  </div>
                  <div className="cat-bar-wrap">
                    <div
                      className={`cat-bar-fill${category.percentage > 100 ? " over" : category.percentage > 80 ? " warn" : ""}`}
                      style={{ width: `${Math.min(category.percentage, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">最近交易</span>
        </div>
        {data.recent_transactions.length > 0 ? (
          data.recent_transactions
            .slice(0, 5)
            .map((tx) => <TxMiniItem key={tx.transaction_id} tx={tx} />)
        ) : (
          <div className="empty-state">
            <div className="empty-emoji">📭</div>
            <div className="empty-text">还没有交易记录</div>
          </div>
        )}
      </div>
    </div>
  );
}
