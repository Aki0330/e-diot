import { useCallback, useEffect, useState } from "react";

import { api } from "../api/client.js";
import type { DashboardData, TransactionDto as Transaction, UserProfile } from "../api/types.js";
import type { Tab } from "../tabs.js";
import { catEmoji, fmt } from "../utils/format.js";

export interface DashboardPageProps {
  readonly active: boolean;
  readonly refreshKey: number;
  readonly user?: UserProfile | null;
  readonly onNavigate?: (tab: Tab) => void;
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function stateOf(pct: number): "normal" | "near" | "over" {
  if (pct >= 100) return "over";
  if (pct >= 80) return "near";
  return "normal";
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

/** 连续记账天数：今天没记就从昨天往前数，避免白天打开时显示中断 */
function streakOf(days: ReadonlySet<string>): number {
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 总览页：本月结果 + 记账习惯 + 分类分布 + 一句建议 */
export function DashboardPage({ active, refreshKey, user, onNavigate }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<readonly Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [dashboard, txns] = await Promise.all([api.dashboard(), api.transactions()]);
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
          <div className="empty-title">数据没加载出来</div>
          <p className="empty-desc">{error}</p>
          <button className="btn-secondary" type="button" onClick={() => void load()}>
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

  const now = new Date();
  const year = Number(data.year_month.slice(0, 4));
  const month = Number(data.year_month.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysPassed = Math.min(now.getDate(), daysInMonth);
  const daysLeft = Math.max(daysInMonth - daysPassed, 1);
  const usage =
    data.total_budget > 0 ? Math.round((data.total_spent / data.total_budget) * 100) : 0;

  // 只统计本月流水（接口默认返回全部，这里按当前年月筛）
  const monthKey = data.year_month.slice(0, 7);
  const monthTxns = transactions.filter(
    (txn) =>
      txn.transaction_time !== null && dayKey(new Date(txn.transaction_time)).startsWith(monthKey),
  );
  const expenseTxns = monthTxns.filter((txn) => txn.type === "EXPENSE");
  const recordedDays = new Set(
    expenseTxns
      .map((txn) => (txn.transaction_time === null ? null : dayKey(new Date(txn.transaction_time))))
      .filter((key): key is string => key !== null),
  );
  const streak = streakOf(recordedDays);
  const avgPerDay = daysPassed > 0 ? data.total_spent / daysPassed : 0;
  const projectedSave = data.remaining - avgPerDay * daysLeft;

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
    const value = expenseTxns
      .filter(
        (txn) => txn.transaction_time !== null && dayKey(new Date(txn.transaction_time)) === key,
      )
      .reduce((sum, txn) => sum + txn.amount, 0);
    return { key, label: `${date.getMonth() + 1}/${date.getDate()}`, value };
  });
  const maxTrend = Math.max(...trend.map((item) => item.value), 1);
  const trendSum = trend.reduce((sum, item) => sum + item.value, 0);

  /** 结果型结论：直接告诉用户月底大概会怎样 */
  const outcome =
    data.total_budget <= 0
      ? "先设一个月度预算，我们才能帮你盯着花。"
      : usage >= 100
        ? `已超出预算 ¥${fmt(data.total_spent - data.total_budget)}，先把最花的两类收一收。`
        : projectedSave > 0
          ? `按现在的节奏，月底预计还能剩下 ¥${fmt(projectedSave)}。`
          : `按现在的节奏，月底可能超出 ¥${fmt(Math.abs(projectedSave))}；每天控制在 ¥${fmt(data.remaining / daysLeft)} 以内就稳了。`;

  return (
    <div className="page dash-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            {MONTHS[month - 1] ?? ""} {year} · OVERVIEW
          </p>
          <h2 className="page-title">
            {greeting()}
            {user !== null && user !== undefined ? `，${user.username}` : ""}
          </h2>
          <p className="page-desc">
            {month} 月已经过去 {daysPassed} 天，你记下了 {expenseTxns.length} 笔支出。
          </p>
        </div>
        <div className="head-side">
          <span className="pill-soft">本月还剩 {daysLeft} 天</span>
          {onNavigate !== undefined && (
            <button className="btn-primary btn-sm" onClick={() => onNavigate("transactions")}>
              ＋ 记一笔
            </button>
          )}
        </div>
      </div>

      {expenseTxns.length === 0 && (
        <section className="onboard">
          <span className="onboard-emoji">🌱</span>
          <div className="onboard-main">
            <b>这个月还没有记录，从一句话开始就行</b>
            <p>说一句「今天午饭 28」，30 秒记完第一笔，之后所有统计都会自动长出来。</p>
          </div>
          {onNavigate !== undefined && (
            <button className="btn-primary btn-sm" onClick={() => onNavigate("chat")}>
              去说一句
            </button>
          )}
        </section>
      )}

      <section className="hero-card">
        <div className="hero-main">
          <div className="hero-label">本月已支出 / SPENT</div>
          <div className="hero-amount num">
            <span>¥</span>
            {fmt(data.total_spent)}
          </div>
          <p className={`hero-outcome${usage >= 100 ? " warn" : ""}`}>{outcome}</p>
          <div className="hero-bar">
            <span style={{ width: `${Math.min(usage, 100)}%` }} />
          </div>
          <div className="hero-bar-meta">
            <span>月预算 ¥{fmt(data.total_budget)}</span>
            <span>已用 {usage}%</span>
          </div>
        </div>

        <div className="hero-side">
          <div className="hero-tile">
            <span className="ht-k">剩余可用</span>
            <b className="ht-v num lime">¥{fmt(data.remaining)}</b>
            <span className="ht-s">还剩 {daysLeft} 天</span>
          </div>
          <div className="hero-tile">
            <span className="ht-k">日均可用</span>
            <b className="ht-v num">¥{fmt(usage >= 100 ? 0 : data.remaining / daysLeft)}</b>
            <span className="ht-s">按剩余天数摊</span>
          </div>
          <div className="hero-tile">
            <span className="ht-k">分类数</span>
            <b className="ht-v num">{rows.length}</b>
            <span className="ht-s">已分配预算</span>
          </div>
        </div>
      </section>

      <div className="ov-grid">
        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">近 7 日消费</div>
              <div className="card-sub">每天花多少，一眼看到峰值在哪天</div>
            </div>
            <span className="badge ink">峰值 ¥{fmt(maxTrend)}</span>
          </div>
          <div className="week-chart">
            {trend.map((item, index) => (
              <div className="week-col" key={item.key}>
                <span className={`week-val num${item.value > 0 ? "" : " zero"}`}>
                  {item.value > 0 ? fmt(item.value) : "—"}
                </span>
                <div
                  className={`week-bar${index === trend.length - 1 ? " today" : item.value === maxTrend && item.value > 0 ? " peak" : ""}`}
                  style={{ height: `${Math.max((item.value / maxTrend) * 100, 3)}%` }}
                  title={`${item.label} ¥${fmt(item.value)}`}
                />
                <span className={`week-x${index === trend.length - 1 ? " today" : ""}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          <div className="week-foot">
            <span className="week-sum num">¥{fmt(trendSum)}</span>
            <span>近 7 日合计 · 日均 ¥{fmt(trendSum / 7)}</span>
          </div>
        </section>

        <section className="card span-5 streak-card">
          <div className="card-head">
            <div>
              <div className="card-title">记账状态</div>
              <div className="card-sub">坚持比精确更重要</div>
            </div>
            {streak >= 3 && (
              <span className="badge lime">🔥 连续 {streak} 天</span>
            )}
          </div>

          <div className="streak-body">
            <div
              className="streak-ring"
              style={{
                background: `conic-gradient(var(--primary) ${Math.min(streak / 7, 1) * 360}deg, rgba(17,24,39,0.08) 0)`,
              }}
            >
              <div className="streak-ring-in">
                <b className="num">{streak}</b>
                <small>连续天数</small>
              </div>
            </div>
            <div className="streak-facts">
              <div>
                <span>本月记录</span>
                <b className="num">{expenseTxns.length} 笔</b>
              </div>
              <div>
                <span>有记录</span>
                <b className="num">
                  {recordedDays.size} / {daysInMonth} 天
                </b>
              </div>
              <div>
                <span>日均支出</span>
                <b className="num">¥{fmt(avgPerDay)}</b>
              </div>
            </div>
          </div>

          <p className="streak-note">
            {streak >= 30
              ? "整整一个月没断过，你已经把记账变成了习惯。"
              : streak >= 14
                ? `连续 ${streak} 天，半个月的账一笔不落。`
                : streak >= 7
                  ? "连续一整周没断过，这个月的账已经很完整了。"
                  : streak >= 3
                    ? `已经连着记了 ${streak} 天，再记一笔就是 ${streak + 1} 天。`
                    : "今天记一笔，连续记录就从现在开始。"}
          </p>
        </section>

        <section className="card span-7">
          <div className="card-head">
            <div>
              <div className="card-title">钱都花在哪了</div>
              <div className="card-sub">按预算使用率排序 · 共 {rows.length} 个分类</div>
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="card-empty">
              <span>🍃</span>
              <p>这个月还没有分类支出，记两笔就能看到分布。</p>
            </div>
          ) : (
            <div className="dist">
              {rows.map((row) => (
                <div className="dist-row" key={row.category}>
                  <div className="icon-tile">{catEmoji(row.category)}</div>
                  <div className="dist-name-wrap">
                    <span className="dist-name">{row.category}</span>
                    <span className={`dist-state ${row.state}`}>
                      {row.state === "over"
                        ? `超 ¥${fmt(row.spent - row.budget)}`
                        : `剩 ¥${fmt(Math.max(row.budget - row.spent, 0))}`}
                    </span>
                  </div>
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
          )}
        </section>

        <section className="advice span-5">
          <div className="advice-head">
            <div className="advice-title">
              <i />
              本月建议
            </div>
            {overRow !== undefined ? (
              <span className="badge red">超支</span>
            ) : nearRow !== undefined ? (
              <span className="badge amber">接近上限</span>
            ) : (
              <span className="badge lime">节奏正常</span>
            )}
          </div>
          {lead !== undefined ? (
            <>
              <p className="advice-text">
                {lead.category}用掉了预算的 <b>{Math.round(lead.percentage)}%</b>
                {lead.state === "over"
                  ? lead.spent - lead.budget > 0
                    ? `，已经超出 ¥${fmt(lead.spent - lead.budget)}。剩下 ${daysLeft} 天，这一类先缓一缓更稳妥。`
                    : `，刚好用满。剩下 ${daysLeft} 天，这一类先缓一缓更稳妥。`
                  : `，还剩 ¥${fmt(Math.max(lead.budget - lead.spent, 0))} 撑完 ${daysLeft} 天，日均 ¥${fmt(Math.max(lead.budget - lead.spent, 0) / daysLeft)} 以内比较稳。`}
              </p>
              <p className="advice-sub">
                {calm !== undefined
                  ? `${calm.category}还有 ¥${fmt(Math.max(calm.budget - calm.spent, 0))} 没用完，可以放心一点。`
                  : "其余分类都在额度内，不用刻意收紧。"}
              </p>
            </>
          ) : (
            <p className="advice-text">本月各分类都在额度内，保持现在的节奏就好。</p>
          )}
          {onNavigate !== undefined && (
            <button className="advice-link" onClick={() => onNavigate("budget")}>
              去调整预算 →
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
