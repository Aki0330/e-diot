import { formatCents, moneySum, parseCents } from "@cyberbudget/shared/money";

/** 给整数部分加千位分隔符，保留分和负号。 */
export const ledgerCents = (cents: bigint): string =>
  formatCents(cents).replace(/\B(?=(?:\d{3})+\.)/g, ",");

export const ledgerAmount = (yuan: number): string => ledgerCents(parseCents(yuan));

export function allocationSummary(total: number, limits: readonly number[]) {
  const allocated = moneySum(limits);
  const remaining = parseCents(total) - allocated;
  if (remaining < 0n) return { allocated, label: `超额分配 ¥${ledgerCents(-remaining)}` };
  if (remaining > 0n) return { allocated, label: `待分配 ¥${ledgerCents(remaining)}` };
  return { allocated, label: allocated === 0n ? "未设月总预算" : "已全部分配" };
}

/** 总览中的非负金额，按天平均后四舍五入到分。 */
export function dailyAverage(yuan: number, days: number): bigint {
  const divisor = BigInt(days);
  return (parseCents(yuan) + divisor / 2n) / divisor;
}

export function budgetProgress(spent: number, budget: number) {
  if (budget <= 0) return { state: "unset", label: "未设额度", width: 0 } as const;
  const spentCents = parseCents(spent);
  const budgetCents = parseCents(budget);
  const state =
    spentCents > budgetCents
      ? "over"
      : spentCents === budgetCents
        ? "full"
        : spentCents * 5n >= budgetCents * 4n
          ? "near"
          : "normal";
  const percent = (spent / budget) * 100;
  const rounded = Number(percent.toFixed(1));
  let label = `${rounded}%`;
  if (rounded === 100 && state !== "full") label = state === "over" ? ">100%" : "<100%";
  if (rounded === 80 && state === "normal") label = "<80%";
  return { state, label, width: Math.min(percent, 100) } as const;
}
