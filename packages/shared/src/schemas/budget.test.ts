import { describe, expect, it } from "vitest";

import {
  manualBudgetRequestSchema,
  validateCategoryBudgets,
  type CategoryBudgetLike,
} from "./budget.js";

const categories: CategoryBudgetLike[] = [
  { category: "餐饮", monthly_limit: 2000 },
  { category: "交通", monthly_limit: 500 },
];

describe("validateCategoryBudgets", () => {
  it("合计不超过总预算时通过并返回合计值", () => {
    const result = validateCategoryBudgets(categories, 3000);

    expect(result).toEqual({ isValid: true, message: "", totalAllocated: 2500 });
  });

  it("合计超出总预算时返回旧版文案", () => {
    const result = validateCategoryBudgets(categories, 2000);

    expect(result.isValid).toBe(false);
    expect(result.totalAllocated).toBe(2500);
    expect(result.message).toBe("子类预算合计 2500.00 超出总预算 2000.00，请调整后重试");
  });

  it("合计等于总预算时视为合法", () => {
    expect(validateCategoryBudgets(categories, 2500).isValid).toBe(true);
  });

  it("空列表合计为 0", () => {
    expect(validateCategoryBudgets([], 0)).toEqual({
      isValid: true,
      message: "",
      totalAllocated: 0,
    });
  });
});

describe("manualBudgetRequestSchema", () => {
  it("接受合法的手动预算", () => {
    const parsed = manualBudgetRequestSchema.parse({
      categories: [{ category: "餐饮", monthly_limit: 2000 }],
      year_month: "2026-10",
    });

    expect(parsed.year_month).toBe("2026-10");
  });

  it("拒绝重复分类并指出分类名", () => {
    const result = manualBudgetRequestSchema.safeParse({
      categories: [
        { category: "餐饮", monthly_limit: 1000 },
        { category: "餐饮", monthly_limit: 500 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("分类「餐饮」重复出现，每个分类只能有一条预算");
    }
  });

  it("拒绝非正数额度", () => {
    const result = manualBudgetRequestSchema.safeParse({
      categories: [{ category: "餐饮", monthly_limit: 0 }],
    });

    expect(result.success).toBe(false);
  });

  it("拒绝非法月份格式", () => {
    const result = manualBudgetRequestSchema.safeParse({
      categories: [{ category: "餐饮", monthly_limit: 100 }],
      year_month: "2026-13",
    });

    expect(result.success).toBe(false);
  });

  it("空分类列表被拒绝", () => {
    const result = manualBudgetRequestSchema.safeParse({ categories: [] });

    expect(result.success).toBe(false);
  });
});
