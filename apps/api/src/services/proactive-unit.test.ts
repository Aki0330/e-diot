import { describe, expect, it } from "vitest";

import {
  capOf,
  decideRule,
  inCareWindow,
  isQuietMinutes,
  parseClock,
  shanghaiNow,
} from "./proactive.js";

describe("shanghaiNow / parseClock", () => {
  it("按 UTC+8 计算本地日期与分钟", () => {
    const local = shanghaiNow(new Date("2026-11-12T09:30:00Z"));
    expect(local.date).toBe("2026-11-12");
    expect(local.minutes).toBe(17 * 60 + 30);
  });

  it("解析 HH:mm", () => {
    expect(parseClock("17:45")).toBe(17 * 60 + 45);
    expect(parseClock("24:00")).toBeUndefined();
    expect(parseClock("9:00")).toBeUndefined();
  });
});

describe("免打扰与补发窗口", () => {
  it("跨午夜免打扰：22:00–08:00", () => {
    const start = parseClock("22:00") ?? 0;
    const end = parseClock("08:00") ?? 0;
    expect(isQuietMinutes(23 * 60 + 30, start, end)).toBe(true);
    expect(isQuietMinutes(7 * 60, start, end)).toBe(true);
    expect(isQuietMinutes(8 * 60, start, end)).toBe(false);
    expect(isQuietMinutes(12 * 60, start, end)).toBe(false);
  });

  it("care_time 后 2 小时内补发，超过则跳过", () => {
    expect(inCareWindow(18 * 60, 17 * 60 + 45)).toBe(true);
    expect(inCareWindow(19 * 60 + 44, 17 * 60 + 45)).toBe(true);
    expect(inCareWindow(20 * 60, 17 * 60 + 45)).toBe(false);
    expect(inCareWindow(17 * 60, 17 * 60 + 45)).toBe(false);
  });

  it("频控上限", () => {
    expect(capOf("low")).toEqual({ days: 7, max: 1 });
    expect(capOf("medium")).toEqual({ days: 1, max: 1 });
    expect(capOf("high")).toEqual({ days: 1, max: 2 });
  });
});

describe("decideRule", () => {
  const now = new Date("2026-11-12T09:00:00Z");

  it("分类超预算优先于其他规则", () => {
    const decision = decideRule({
      now,
      totalBudget: 1000,
      totalSpent: 500,
      budgetRows: [{ category: "餐饮", budget: 100, spent: 120 }],
      lastTransactionAt: now,
    });
    expect(decision?.kind).toBe("budget_over");
    expect(decision?.body).toContain("餐饮");
  });

  it("接近上限在无超支时触发", () => {
    const decision = decideRule({
      now,
      totalBudget: 1000,
      totalSpent: 850,
      budgetRows: [],
      lastTransactionAt: now,
    });
    expect(decision?.kind).toBe("budget_near");
  });

  it("连续 3 天无记录触发 inactivity", () => {
    const last = new Date(now.getTime() - 4 * 86_400_000);
    const decision = decideRule({
      now,
      totalBudget: 0,
      totalSpent: 0,
      budgetRows: [],
      lastTransactionAt: last,
    });
    expect(decision?.kind).toBe("inactivity");
    expect(decision?.body).toContain("4 天");
  });

  it("没有命中规则时不发消息", () => {
    expect(
      decideRule({
        now,
        totalBudget: 1000,
        totalSpent: 100,
        budgetRows: [],
        lastTransactionAt: now,
      }),
    ).toBeNull();
  });
});
