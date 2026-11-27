import { useCallback, useEffect, useState } from "react";
import { parseCents } from "@cyberbudget/shared/money";

import { api } from "../api/client.js";
import type { DashboardData } from "../api/types.js";
import { catEmoji } from "../utils/format.js";
import { budgetProgress, dailyAverage, ledgerAmount as fmt, ledgerCents } from "../utils/ledger.js";

export interface DashboardPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
}

/** 总览页：page-head + 12 栅格（总支出 / 记录规律 / 分类分布 / 近 7 日 / 最近交易 / 建议） */
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
      <div className="page">
        <div className="empty">
          <div className="empty-title">加载失败</div>
          <p className="empty-desc">{error}</p>
          <button className="btn-secondary" onClick={() => void load()}>
            重新加载
          </button>
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

  return <DashboardReport data={data} />;
}

export function DashboardReport({ data }: { data: DashboardData }) {
  const now = new Date();
  const year = Number(data.year_month.slice(0, 4));
  const month = Number(data.year_month.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = Math.min(now.getUTCDate(), daysInMonth);
  const daysLeft = daysInMonth - daysPassed;
  const usage = budgetProgress(data.total_spent, data.total_budget);

  const rows = [...data.categories]
    .map((row) => ({ ...row, progress: budgetProgress(row.spent, row.budget) }))
    .sort((a, b) => b.percentage - a.percentage);
  const lead =
    rows.find((row) => row.progress.state === "over") ??
    rows.find((row) => row.progress.state === "full") ??
    rows.find((row) => row.progress.state === "near");
  const allocatedCount = rows.filter((row) => row.budget > 0).length;

  const trend = data.activity.last_seven_days;
  const maxTrend = Math.max(...trend.map((day) => day.spent), 0);
  const trendSum = data.activity.seven_day_spent;

  return (
    <div className="page ledger-page">
      <div className="page-head">
        <div>
          <h2 className="page-title">本月总览</h2>
          <p className="ledger-period">
            {year} 年 {month} 月
          </p>
        </div>
      </div>

      <div className="ov-grid">
        <section className="total-card">
          <div className="total-label">本月支出</div>
          <div className="total-main">
            <span className="v num">¥{fmt(data.total_spent)}</span>
            <span className="u">{data.activity.expense_count} 笔支出</span>
          </div>
          <div className="total-foot">
            <div>
              <div className="tf-k">本月收入</div>
              <div className="tf-v num">¥{fmt(data.total_income)}</div>
            </div>
            <div>
              <div className="tf-k">月总预算</div>
              <div className="tf-v num">¥{fmt(data.total_budget)}</div>
            </div>
            <div>
              <div className="tf-k">剩余可用</div>
              <div className="tf-v num">
                {data.total_budget > 0 ? `¥${fmt(data.remaining)}` : "—"}
              </div>
            </div>
            <div>
              <div className="tf-k">日均可用（剩 {daysLeft} 天）</div>
              <div className="tf-v num">
                {daysLeft > 0 && data.total_budget > 0
                  ? `¥${ledgerCents(dailyAverage(Math.max(data.remaining, 0), daysLeft))}`
                  : "—"}
              </div>
            </div>
          </div>
          <div className="total-bar">
            <div className="bar">
              <span style={{ width: `${usage.width}%` }} />
            </div>
            <div className="total-bar-meta">
              <span>{usage.state === "unset" ? "未设月总预算" : `已用 ${usage.label}`}</span>
              <span>已分配 {allocatedCount} 个分类</span>
            </div>
          </div>
        </section>

        <section className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">记录规律</div>
            </div>
          </div>
          <div className="pat-mini">
            <div>
              <span>有记录天数</span>
              <b className="num">{data.activity.recorded_days} 天</b>
            </div>
            <div>
              <span>分类数量</span>
              <b className="num">{rows.length} 个</b>
            </div>
            <div>
              <span>近 7 日有记录</span>
              <b className="num">{trend.filter((day) => day.recorded).length} 天</b>
            </div>
          </div>
        </section>

        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">分类支出分布</div>
              <div className="card-sub">按预算使用率降序 · {rows.length} 个分类</div>
            </div>
          </div>
          <div className="dist">
            {rows.length === 0 && <p className="ledger-empty">本月暂无分类支出或预算。</p>}
            {rows.map((row) => (
              <div className="dist-row" key={row.category}>
                <div className="icon-tile">{catEmoji(row.category)}</div>
                <span className="dist-name">{row.category}</span>
                <div className={`bar ${row.progress.state}`}>
                  <span style={{ width: `${row.progress.width}%` }} />
                </div>
                <span className="dist-pct">{row.progress.label}</span>
                <span className="dist-amt">¥{fmt(row.spent)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card span-5">
          <div className="card-head">
            <div>
              <div className="card-title">近 7 日消费</div>
            </div>
            <span className="badge ink">峰值 ¥{fmt(maxTrend)}</span>
          </div>
          <div className="spark-bars">
            {trend.map((item, index) => (
              <div className="spark-col" key={item.date}>
                <div
                  className={`spark-bar${index === trend.length - 1 ? " last" : item.spent === maxTrend ? " peak" : ""}`}
                  style={{
                    height: `${maxTrend > 0 && item.spent > 0 ? Math.max((item.spent / maxTrend) * 88, 2) : 0}%`,
                    minHeight: item.spent > 0 ? 2 : 0,
                  }}
                  title={`${item.date} ¥${fmt(item.spent)}`}
                />
                <span className="spark-x">{item.date.slice(5).replace("-", "/")}</span>
              </div>
            ))}
          </div>
          <div className="spark-foot">
            <span className="spark-sum num">
              ¥{fmt(trendSum)}
              <small>7 日合计</small>
            </span>
            <span>日均 ¥{ledgerCents(dailyAverage(trendSum, 7))}</span>
          </div>
        </section>

        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">最近交易</div>
            </div>
          </div>
          <div className="recent">
            {data.recent_transactions.length === 0 && (
              <p className="ledger-empty">记下第一笔后，就能在这里查看。</p>
            )}
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
            <div className="advice-title">预算提醒</div>
          </div>
          {lead !== undefined ? (
            <>
              <p className="advice-text">
                {lead.category}预算已使用 <b>{lead.progress.label}</b>
                {lead.progress.state === "over"
                  ? `，超出 ¥${ledgerCents(parseCents(lead.spent) - parseCents(lead.budget))}。`
                  : lead.progress.state === "full"
                    ? "，本月额度已用完。"
                    : `，本月还可用 ¥${ledgerCents(parseCents(lead.budget) - parseCents(lead.spent))}。`}
              </p>
            </>
          ) : (
            <p className="advice-text">
              {allocatedCount > 0 ? "各分类已用额度均低于 80%。" : "设置分类额度后可查看预算提醒。"}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
