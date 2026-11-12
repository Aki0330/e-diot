import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { DashboardData, TransactionDto as Transaction } from "../api/types.js";
import { catEmoji, fmt } from "../utils/format.js";

export interface DashboardPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function stateOf(pct: number): "normal" | "near" | "over" {
  if (pct >= 100) return "over";
  if (pct >= 80) return "near";
  return "normal";
}

/** 总览页：page-head + 12 栅格（总支出 / 记录规律 / 分类分布 / 近 7 日 / 最近交易 / 建议） */
export function DashboardPage({ active, refreshKey }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<readonly Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [dashboard, txns] = await Promise.all([api.dashboard(), api.transactions("")]);
      setData(dashboard);
      setTransactions(txns.transactions);
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
      <div className="page">
        <div className="empty">
          <div className="empty-icon">😵</div>
          <div className="empty-title">加载失败</div>
          <p className="empty-desc">{error}</p>
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="page">
        <div className="empty">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const now = new Date();
  const year = Number(data.year_month.slice(0, 4));
  const month = Number(data.year_month.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = Math.min(now.getDate(), daysInMonth);
  const daysLeft = Math.max(daysInMonth - daysPassed, 1);
  const usage =
    data.total_budget > 0 ? Math.round((data.total_spent / data.total_budget) * 100) : 0;

  const rows = [...data.categories]
    .map((row) => ({ ...row, state: stateOf(row.percentage) }))
    .sort((a, b) => b.percentage - a.percentage);
  const overRow = rows.find((row) => row.state === "over");
  const nearRow = rows.find((row) => row.state === "near");
  const lead = overRow ?? nearRow;
  const calm = rows.find((row) => row.state === "normal");

  const trend = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index));
    const key = dayKey(date);
    const value = transactions
      .filter(
        (txn) =>
          txn.type === "EXPENSE" &&
          txn.transaction_time !== null &&
          dayKey(new Date(txn.transaction_time)) === key,
      )
      .reduce((sum, txn) => sum + txn.amount, 0);
    return { key, label: `${date.getMonth() + 1}/${date.getDate()}`, value };
  });
  const maxTrend = Math.max(...trend.map((item) => item.value), 1);
  const trendSum = trend.reduce((sum, item) => sum + item.value, 0);
  const recordedDays = new Set(
    transactions
      .map((txn) => (txn.transaction_time === null ? null : dayKey(new Date(txn.transaction_time))))
      .filter((key): key is string => key !== null),
  ).size;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            OVERVIEW · {year}年{month}月
          </p>
          <h2 className="page-title">本月总览</h2>
          <p className="page-desc">收支、预算与记录规律放在一处，数字与账单逐笔对得上。</p>
        </div>
        <div className="head-side">
          <span className="chip" style={{ cursor: "default" }}>
            本月已过 {daysPassed} 天
          </span>
          <span className={`badge ${usage >= 100 ? "red" : "lime"}`}>使用率 {usage}%</span>
        </div>
      </div>

      <div className="ov-grid">
        <section className="total-card">
          <div className="total-label">本月已支出 / SPENT</div>
          <div className="total-main">
            <span className="v num">¥{fmt(data.total_spent)}</span>
            <span className="u">
              CNY · {transactions.filter((t) => t.type === "EXPENSE").length} 笔
            </span>
          </div>
          <div className="total-foot">
            <div>
              <div className="tf-k">月总预算</div>
              <div className="tf-v num">¥{fmt(data.total_budget)}</div>
            </div>
            <div>
              <div className="tf-k">剩余可用</div>
              <div className="tf-v num lime">¥{fmt(data.remaining)}</div>
            </div>
            <div>
              <div className="tf-k">日均可用（剩 {daysLeft} 天）</div>
              <div className="tf-v num">¥{fmt(usage >= 100 ? 0 : data.remaining / daysLeft)}</div>
            </div>
          </div>
          <div className="total-bar">
            <div className="bar">
              <span style={{ width: `${Math.min(usage, 100)}%` }} />
            </div>
            <div className="total-bar-meta">
              <span>已用 {usage}%</span>
              <span>已分配 {rows.length} 个分类</span>
            </div>
          </div>
        </section>

        <section className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">记录规律</div>
              <div className="card-sub">基于当前流水实时计算</div>
            </div>
            <span className="badge ink tiny">基于流水</span>
          </div>
          <div className="pat-mini">
            <div>
              <span>有记录天数</span>
              <b className="num">{recordedDays} 天</b>
            </div>
            <div>
              <span>分类数量</span>
              <b className="num">{rows.length} 个</b>
            </div>
            <div>
              <span>近 7 日有记录</span>
              <b className="num">{trend.filter((item) => item.value > 0).length} 天</b>
            </div>
          </div>
        </section>

        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">分类支出分布</div>
              <div className="card-sub">按预算使用率降序 · {rows.length} 个分类</div>
            </div>
            <span className="badge ink">共 ¥{fmt(data.total_spent)}</span>
          </div>
          <div className="dist">
            {rows.map((row) => (
              <div className="dist-row" key={row.category}>
                <div className="icon-tile">{catEmoji(row.category)}</div>
                <span className="dist-name">{row.category}</span>
                <div
                  className={`bar${row.state === "over" ? " red" : row.state === "near" ? " amber" : ""}`}
                >
                  <span style={{ width: `${Math.min(row.percentage, 100)}%` }} />
                </div>
                <span className="dist-pct">{Math.round(row.percentage)}%</span>
                <span className="dist-amt">¥{fmt(row.spent)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">近 7 日消费</div>
              <div className="card-sub">按日汇总 · 来自全部流水</div>
            </div>
            <span className="badge ink">峰值 ¥{fmt(maxTrend)}</span>
          </div>
          <div className="spark-bars">
            {trend.map((item, index) => (
              <div className="spark-col" key={item.key}>
                <div
                  className={`spark-bar${index === trend.length - 1 ? " last" : item.value === maxTrend ? " peak" : ""}`}
                  style={{ height: `${Math.max((item.value / maxTrend) * 88, 2)}%` }}
                  title={`${item.label} ¥${fmt(item.value)}`}
                />
                <span className="spark-x">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="spark-foot">
            <span className="spark-sum num">
              ¥{fmt(trendSum)}
              <small>7 日合计</small>
            </span>
            <span>日均 ¥{fmt(trendSum / 7)}</span>
          </div>
        </section>

        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">最近交易</div>
              <div className="card-sub">与 AI 助手、账单页同一数据源</div>
            </div>
          </div>
          <div className="recent">
            {data.recent_transactions.slice(0, 5).map((txn) => (
              <div className="recent-row" key={txn.transaction_id}>
                <div className="icon-tile">{catEmoji(txn.category)}</div>
                <div>
                  <div className="recent-name">{txn.note ?? txn.category}</div>
                  <div className="recent-meta">
                    {txn.transaction_time?.slice(5, 10).replace("-", "/")} · {txn.category}
                  </div>
                </div>
                <div className={`recent-amt${txn.type === "INCOME" ? " income" : ""}`}>
                  {txn.type === "INCOME" ? "+" : "-"}¥{fmt(txn.amount)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="advice span-5">
          <div className="advice-head">
            <div className="advice-title">
              <i />
              规则触发 · 预算监控
            </div>
            {overRow !== undefined ? (
              <span className="badge red">超支</span>
            ) : nearRow !== undefined ? (
              <span className="badge amber">接近上限</span>
            ) : (
              <span className="badge lime">正常</span>
            )}
          </div>
          {lead !== undefined ? (
            <>
              <p className="advice-text">
                {lead.category}预算已使用 <b>{Math.round(lead.percentage)}%</b>
                {lead.state === "over"
                  ? `，超出 ¥${fmt(Math.max(lead.spent - lead.budget, 0))}；本月剩余 ${daysLeft} 天，建议暂停非必要${lead.category}支出。`
                  : `，本月剩余 ${daysLeft} 天，日均可用约 ¥${fmt(Math.max(lead.budget - lead.spent, 0) / daysLeft)}。`}
              </p>
              <p className="advice-sub">
                {calm !== undefined
                  ? `另一条规则：${calm.category}已使用 ${Math.round(calm.percentage)}%，本月还有 ¥${fmt(Math.max(calm.budget - calm.spent, 0))} 可用，暂无需收紧。`
                  : "其余分类均在额度内。"}
              </p>
            </>
          ) : (
            <p className="advice-text">本月各分类都在额度内，保持当前节奏即可。</p>
          )}
        </section>
      </div>
    </div>
  );
}
