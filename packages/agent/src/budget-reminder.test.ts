import type { AgentState } from "@cyberbudget/shared";
import { describe, expect, it } from "vitest";

import {
  BUDGET_THRESHOLDS,
  budgetCrossings,
  crossedThresholds,
  shouldMentionBudget,
} from "./budget-reminder.js";

function stateWith(overrides: Partial<AgentState>): AgentState {
  return { user_id: "u", user_input: "x", ...overrides };
}

describe("crossedThresholds", () => {
  it("49% → 51% 跨过 50%", () => {
    expect(crossedThresholds(49, 51, 100)).toEqual([50]);
  });

  it("51% → 55% 不重复提醒", () => {
    expect(crossedThresholds(51, 55, 100)).toEqual([]);
  });

  it("79% → 81% 跨过 80%", () => {
    expect(crossedThresholds(79, 81, 100)).toEqual([80]);
  });

  it("一次跨过多条线时全部返回", () => {
    expect(crossedThresholds(0, 120, 100)).toEqual([...BUDGET_THRESHOLDS]);
  });

  it("额度为 0 或金额未增加时不提醒", () => {
    expect(crossedThresholds(0, 100, 0)).toEqual([]);
    expect(crossedThresholds(60, 60, 100)).toEqual([]);
  });
});

describe("budgetCrossings", () => {
  const base = {
    category: "餐饮",
    monthly_budget: 1000,
    total_spent_this_month: 600,
    category_budget: 100,
    category_remaining: 0,
    is_over_budget: false,
    remaining: 400,
    spent_this_month: 55,
  };

  it("普通记账未跨线时不给提醒", () => {
    expect(
      budgetCrossings(
        stateWith({
          budget_status: { ...base, spent_this_month: 55, total_spent_this_month: 300 },
          intent: {
            intent_type: "add_transaction",
            transaction: { transaction_type: "expense", amount: 5, category: "餐饮" },
          },
        }),
      ),
    ).toEqual([]);
  });

  it("分类跨过 50% 时提醒一次", () => {
    const crossings = budgetCrossings(
      stateWith({
        budget_status: { ...base, spent_this_month: 55, total_spent_this_month: 300 },
        intent: {
          intent_type: "add_transaction",
          transaction: { transaction_type: "expense", amount: 10, category: "餐饮" },
        },
      }),
    );
    expect(crossings).toHaveLength(1);
    expect(crossings[0]?.scope).toBe("category");
    expect(crossings[0]?.threshold).toBe(50);
  });

  it("总额跨过 80% 时提醒", () => {
    const crossings = budgetCrossings(
      stateWith({
        budget_status: { ...base, category_budget: 0, total_spent_this_month: 805 },
        intent: {
          intent_type: "add_transaction",
          transaction: { transaction_type: "expense", amount: 10, category: "餐饮" },
        },
      }),
    );
    expect(crossings.map((item) => item.threshold)).toEqual([80]);
  });
});

describe("shouldMentionBudget", () => {
  it("闲聊默认不提预算", () => {
    expect(
      shouldMentionBudget(
        stateWith({
          intent: { intent_type: "chat" },
          budget_status: {
            category: "全部",
            monthly_budget: 1000,
            total_spent_this_month: 600,
            category_budget: 0,
            category_remaining: 0,
            is_over_budget: false,
            remaining: 400,
            spent_this_month: 600,
          },
        }),
      ),
    ).toBe(false);
  });

  it("查询预算时提预算", () => {
    expect(shouldMentionBudget(stateWith({ intent: { intent_type: "query_budget" } }))).toBe(true);
  });
});
