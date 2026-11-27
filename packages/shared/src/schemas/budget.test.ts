import { describe, expect, it } from "vitest";

import {
  budgetResponseSchema,
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

  it("一角与两角相加恰好用完三角预算", () => {
    const result = validateCategoryBudgets(
      [
        { category: "一", monthly_limit: 0.1 },
        { category: "二", monthly_limit: 0.2 },
      ],
      0.3,
    );
    expect(result).toEqual({ isValid: true, message: "", totalAllocated: 0.3 });
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
  it("能读取已有的零元分类，同时拒绝写入新的零元分类", () => {
    const oldCategories = [{ category: "旧分类", monthly_limit: 0 }];
    expect(
      budgetResponseSchema.safeParse({
        user_id: "legacy",
        year_month: "2026-10",
        categories: oldCategories,
        total_budget: 10,
        total_allocated: 0,
        remaining_unallocated: 10,
        is_valid: true,
      }).success,
    ).toBe(true);
    expect(manualBudgetRequestSchema.safeParse({ categories: oldCategories }).success).toBe(false);
  });

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

  it.each([
    [0.001, false],
    [0.005, true],
    [9_999_999_999.994, true],
    [9_999_999_999.995, false],
  ])("按 numeric(12,2) 舍入后校验 %s", (monthlyLimit, expected) => {
    const result = manualBudgetRequestSchema.safeParse({
      categories: [{ category: "餐饮", monthly_limit: monthlyLimit }],
    });
    expect(result.success).toBe(expected);
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
