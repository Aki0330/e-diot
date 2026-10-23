import { describe, expect, it } from "vitest";

import { computeBudgetStatus, isOverBudget } from "./budget-status.js";

describe("isOverBudget（方案 5.5）", () => {
  it("设置了分类预算且花费超过它 → 超支", () => {
    expect(isOverBudget({ spent: 1200, monthlyBudget: 5000, categoryBudget: 1000 })).toBe(true);
  });

  it("设置了分类预算且花费未超过它 → 正常（即使已超过总预算）", () => {
    expect(isOverBudget({ spent: 900, monthlyBudget: 500, categoryBudget: 1000 })).toBe(false);
  });

  it("花费等于分类预算 → 不算超支", () => {
    expect(isOverBudget({ spent: 1000, monthlyBudget: 5000, categoryBudget: 1000 })).toBe(false);
  });

  it("未设置分类预算时回退到总预算比较", () => {
    expect(isOverBudget({ spent: 5001, monthlyBudget: 5000 })).toBe(true);
    expect(isOverBudget({ spent: 5000, monthlyBudget: 5000 })).toBe(false);
    expect(isOverBudget({ spent: 4999.99, monthlyBudget: 5000 })).toBe(false);
  });

  it("分类预算为 0 视为未设置", () => {
    expect(isOverBudget({ spent: 5001, monthlyBudget: 5000, categoryBudget: 0 })).toBe(true);
  });

  it("总预算为 0 且未设置分类预算 → 永不超支", () => {
    expect(isOverBudget({ spent: 99999, monthlyBudget: 0 })).toBe(false);
  });

  it("分类预算为负数（脏数据）按未设置处理", () => {
    expect(isOverBudget({ spent: 100, monthlyBudget: 50, categoryBudget: -1 })).toBe(true);
  });

  it("金额用字符串也能正确比较", () => {
    expect(isOverBudget({ spent: "1000.01", monthlyBudget: "5000.00" })).toBe(false);
    expect(isOverBudget({ spent: "5000.01", monthlyBudget: "5000.00" })).toBe(true);
  });
});

describe("computeBudgetStatus", () => {
  it("返回旧 BudgetStatus 的字段（剩余可为负）", () => {
    const status = computeBudgetStatus({ spent: 1200, monthlyBudget: 5000, categoryBudget: 1000 });

    expect(status).toEqual({
      spent: "1200.00",
      monthlyBudget: "5000.00",
      categoryBudget: "1000.00",
      isOverBudget: true,
      remaining: "3800.00",
      categoryRemaining: "-200.00",
    });
  });

  it("未设置分类预算时分类剩余为负值（与旧实现一致）", () => {
    const status = computeBudgetStatus({ spent: 300, monthlyBudget: 5000 });

    expect(status.categoryBudget).toBe("0.00");
    expect(status.categoryRemaining).toBe("-300.00");
    expect(status.isOverBudget).toBe(false);
  });
});
