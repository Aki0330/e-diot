import { randomUUID } from "node:crypto";

import {
  appendMessage,
  attachProactiveMessage,
  claimProactiveEvent,
  countSentEvents,
  createSession,
  findEventByMessage,
  latestTransactionAt,
  listActiveUserSettings,
  listMonthBudgets,
  listSessions,
  setProactiveFeedback,
  sumAmountSince,
  sumByCategorySince,
  touchSession,
  upsertUserSettings,
  type ActiveUserSettings,
  type Database,
} from "@cyberbudget/db";
import { monthStartUtc, type ProactiveFeedback, type ProactiveKind } from "@cyberbudget/shared";
import type { FastifyInstance } from "fastify";

/**
 * 主动关怀 v1（站内）。
 *
 * 规则：budget_over > budget_near > inactivity（连续 3 天无记录）
 * 频控：low 1 条/周、medium 1 条/天、high 2 条/天
 * 时区：固定 Asia/Shanghai（UTC+8）
 * 补发：care_time 后 2 小时内仍会尝试一次
 */

const OFFSET_MINUTES = 8 * 60;
const CATCH_UP_MINUTES = 120;
const DAY_MS = 86_400_000;

export interface LocalNow {
  readonly date: string;
  readonly minutes: number;
}

export function shanghaiNow(now: Date): LocalNow {
  const local = new Date(now.getTime() + OFFSET_MINUTES * 60_000);
  const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
  return { date, minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

export function parseClock(value: string): number | undefined {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (matched === null) return undefined;
  return Number(matched[1]) * 60 + Number(matched[2]);
}

/** 免打扰跨午夜判断（start > end 视为跨天） */
export function isQuietMinutes(nowMinutes: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end
    ? nowMinutes >= start && nowMinutes < end
    : nowMinutes >= start || nowMinutes < end;
}

/** care_time 是否落在补发窗口内 */
export function inCareWindow(nowMinutes: number, careMinutes: number): boolean {
  const diff = nowMinutes - careMinutes;
  return diff >= 0 && diff <= CATCH_UP_MINUTES;
}

function dateMinus(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() - days);
  return base.toISOString().slice(0, 10);
}

interface Cap {
  readonly days: number;
  readonly max: number;
}

export function capOf(level: string): Cap {
  if (level === "low") return { days: 7, max: 1 };
  if (level === "high") return { days: 1, max: 2 };
  return { days: 1, max: 1 };
}

const PERSONA_PREFIX: Record<string, string> = {
  lurker: "",
  introvert: "打扰一下，",
  buddy: "嘿，",
  chatterbox: "我刚看了下，",
};

function personalityWrap(persona: string, body: string): string {
  return `${PERSONA_PREFIX[persona] ?? ""}${body}`;
}

interface RuleDecision {
  readonly kind: ProactiveKind;
  readonly body: string;
  readonly basis: Record<string, unknown>;
}

interface BudgetRow {
  readonly category: string;
  readonly budget: number;
  readonly spent: number;
}

/** 纯函数：根据预算与最近记账时间决定触发哪条规则 */
export function decideRule(input: {
  readonly now: Date;
  readonly totalBudget: number;
  readonly totalSpent: number;
  readonly budgetRows: readonly BudgetRow[];
  readonly lastTransactionAt: Date | undefined;
}): RuleDecision | null {
  const { now, totalBudget, totalSpent, budgetRows, lastTransactionAt } = input;

  const overCategory = budgetRows.find((row) => row.budget > 0 && row.spent >= row.budget);
  if (overCategory !== undefined) {
    return {
      kind: "budget_over",
      body: `这个月「${overCategory.category}」已经超预算了（已花 ¥${Math.round(overCategory.spent)} / 额度 ¥${Math.round(overCategory.budget)}），接下来先缓一缓吧。`,
      basis: { scope: "category", category: overCategory.category },
    };
  }
  if (totalBudget > 0 && totalSpent >= totalBudget) {
    return {
      kind: "budget_over",
      body: `这个月总预算已经用完了（已花 ¥${Math.round(totalSpent)} / 额度 ¥${Math.round(totalBudget)}），接下来先缓一缓吧。`,
      basis: { scope: "total" },
    };
  }

  const nearCategory = budgetRows.find((row) => row.budget > 0 && row.spent / row.budget >= 0.8);
  if (nearCategory !== undefined) {
    const percent = Math.round((nearCategory.spent / nearCategory.budget) * 100);
    return {
      kind: "budget_near",
      body: `提醒一下，「${nearCategory.category}」预算已经用到 ${percent}% 了（已花 ¥${Math.round(nearCategory.spent)} / 额度 ¥${Math.round(nearCategory.budget)}）。`,
      basis: { scope: "category", category: nearCategory.category, percent },
    };
  }
  if (totalBudget > 0 && totalSpent / totalBudget >= 0.8) {
    return {
      kind: "budget_near",
      body: `提醒一下，总预算已经用到 ${Math.round((totalSpent / totalBudget) * 100)}% 了。`,
      basis: { scope: "total" },
    };
  }

  if (lastTransactionAt !== undefined) {
    const days = Math.floor((now.getTime() - lastTransactionAt.getTime()) / DAY_MS);
    if (days >= 3) {
      return {
        kind: "inactivity",
        body: `已经 ${days} 天没有记账了。最近还好吗？想记一笔的话随时跟我说。`,
        basis: { days },
      };
    }
  }

  return null;
}

async function collectBudget(
  db: Database,
  userId: string,
  now: Date,
): Promise<{ totalBudget: number; totalSpent: number; rows: BudgetRow[] }> {
  const monthStart = monthStartUtc(now);
  const totalSpent = Number(
    await sumAmountSince(db, { userId, type: "EXPENSE", since: monthStart }),
  );
  const [budgets, totals] = await Promise.all([
    listMonthBudgets(db, userId, formatMonth(now)),
    sumByCategorySince(db, { userId, type: "EXPENSE", since: monthStart }),
  ]);
  const spentByCategory = new Map(totals.map((row) => [row.category, Number(row.total)]));
  const rows = budgets.map((row) => ({
    category: row.category,
    budget: Number(row.monthlyLimit),
    spent: spentByCategory.get(row.category) ?? 0,
  }));
  return { totalBudget: 0, totalSpent, rows };
}

function formatMonth(now: Date): string {
  const local = new Date(now.getTime() + OFFSET_MINUTES * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function pickSession(db: Database, userId: string, now: Date): Promise<string> {
  const sessions = await listSessions(db, userId);
  const recent = sessions[0];
  if (recent !== undefined && now.getTime() - recent.updatedAt.getTime() <= 7 * DAY_MS) {
    return recent.sessionId;
  }
  const sessionId = randomUUID().replaceAll("-", "");
  await createSession(db, { sessionId, userId, title: "E-diot 的关心" });
  return sessionId;
}

export interface ProactiveTickItem {
  readonly userId: string;
  readonly kind: ProactiveKind;
}

export interface ProactiveTickResult {
  readonly checked: number;
  readonly sent: number;
  readonly skipped: number;
  readonly items: readonly ProactiveTickItem[];
}

export async function runProactiveTick(
  db: Database,
  now: Date = new Date(),
): Promise<ProactiveTickResult> {
  const local = shanghaiNow(now);
  const users = await listActiveUserSettings(db);
  const items: ProactiveTickItem[] = [];
  let skipped = 0;

  for (const user of users) {
    if (!shouldConsider(user, local, now)) {
      skipped += 1;
      continue;
    }

    const cap = capOf(user.proactiveLevel);
    const since = dateMinus(local.date, cap.days - 1);
    const sentRecently = await countSentEvents(db, user.userId, since);
    if (sentRecently >= cap.max) {
      skipped += 1;
      continue;
    }

    const monthlyBudget = Number(user.monthlyBudget ?? "0");
    const { totalSpent, rows } = await collectBudget(db, user.userId, now);
    const lastTransactionAt = await latestTransactionAt(db, user.userId);
    const decision = decideRule({
      now,
      totalBudget: monthlyBudget,
      totalSpent,
      budgetRows: rows,
      lastTransactionAt,
    });
    if (decision === null) {
      skipped += 1;
      continue;
    }

    const event = await claimProactiveEvent(db, {
      userId: user.userId,
      localDate: local.date,
      kind: decision.kind,
      payload: decision.basis,
    });
    if (event === undefined) {
      skipped += 1;
      continue;
    }

    const sessionId = await pickSession(db, user.userId, now);
    const message = await appendMessage(db, {
      sessionId,
      role: "assistant",
      content: personalityWrap(user.persona, decision.body),
      isProactive: true,
      executionData: { care: { kind: decision.kind, basis: decision.basis } },
    });
    await attachProactiveMessage(db, event.id, sessionId, message.messageId);
    await touchSession(db, sessionId, { at: now });
    items.push({ userId: user.userId, kind: decision.kind });
  }

  return { checked: users.length, sent: items.length, skipped, items };
}

function shouldConsider(user: ActiveUserSettings, local: LocalNow, now: Date): boolean {
  const care = parseClock(user.careTime);
  const quietStart = parseClock(user.quietStart);
  const quietEnd = parseClock(user.quietEnd);
  if (care === undefined || quietStart === undefined || quietEnd === undefined) return false;
  if (!inCareWindow(local.minutes, care)) return false;
  if (isQuietMinutes(care, quietStart, quietEnd)) return false;
  if (isQuietMinutes(local.minutes, quietStart, quietEnd)) return false;
  if (user.snoozeUntil !== null && user.snoozeUntil.getTime() > now.getTime()) return false;
  return true;
}

export async function submitProactiveFeedback(
  db: Database,
  userId: string,
  messageId: number,
  value: ProactiveFeedback,
  now: Date = new Date(),
): Promise<{ ok: boolean; snoozeUntil: Date | null }> {
  const event = await findEventByMessage(db, userId, messageId);
  if (event === undefined) return { ok: false, snoozeUntil: null };

  await setProactiveFeedback(db, userId, messageId, value, now);
  if (value === "mute") {
    const snoozeUntil = new Date(now.getTime() + DAY_MS);
    await upsertUserSettings(db, userId, { snoozeUntil });
    return { ok: true, snoozeUntil };
  }
  return { ok: true, snoozeUntil: null };
}

/** 在 API 进程内启动调度器；测试与 PROACTIVE_ENABLED=false 时跳过 */
export function startProactiveScheduler(app: FastifyInstance, env: string): void {
  if (env === "test" || process.env["PROACTIVE_ENABLED"] === "false") return;
  const tick = (): void => {
    void runProactiveTick(app.db)
      .then((result) => {
        if (result.sent > 0) app.log.info({ proactive: result.sent }, "主动关怀已发送");
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, "主动关怀调度失败");
      });
  };
  const timer = setInterval(tick, 60_000);
  timer.unref();
  const boot = setTimeout(tick, 5_000);
  boot.unref();
  app.addHook("onClose", () => {
    clearInterval(timer);
    clearTimeout(boot);
  });
}
