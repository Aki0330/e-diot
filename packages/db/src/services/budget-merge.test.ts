import { describe, expect, it, vi } from "vitest";

import {
  mergeAndValidateBudgets,
  persistMergedBudgets,
  type MergedCategory,
} from "./budget-merge.js";

const existing = [
  { category: "餐饮", monthlyLimit: "2000.00" },
  { category: "交通", monthlyLimit: "500.00" },
];

function toMap(categories: readonly { category: string; monthlyLimit: string }[]) {
  return Object.fromEntries(categories.map((item) => [item.category, item.monthlyLimit]));
}

describe("mergeAndValidateBudgets", () => {
  it("覆盖同名分类，保留未提及的分类", () => {
    const result = mergeAndValidateBudgets({
      existing,
      incoming: [{ category: "餐饮", monthlyLimit: 2500 }],
      totalBudget: 3000,
    });

    expect(result.isValid).toBe(true);
    expect(result.message).toBe("");
    expect(result.mergedTotal).toBe("3000.00");
    expect(toMap(result.merged)).toEqual({ 餐饮: "2500.00", 交通: "500.00" });
  });

  it("新增分类追加到结果里", () => {
    const result = mergeAndValidateBudgets({
      existing,
      incoming: [{ category: "购物", monthlyLimit: "300" }],
      totalBudget: 5000,
    });

    expect(toMap(result.merged)).toEqual({ 餐饮: "2000.00", 交通: "500.00", 购物: "300.00" });
    expect(result.mergedTotal).toBe("2800.00");
  });

  it("合计等于总预算视为合法（边界）", () => {
    const result = mergeAndValidateBudgets({ existing, incoming: [], totalBudget: 2500 });

    expect(result.isValid).toBe(true);
    expect(result.mergedTotal).toBe("2500.00");
  });

  it("超出总预算时给出旧版文案（分类按码点排序、额度取整）", () => {
    const result = mergeAndValidateBudgets({
      existing,
      incoming: [{ category: "餐饮", monthlyLimit: 2500 }],
      totalBudget: 2500,
    });

    expect(result.isValid).toBe(false);
    expect(result.mergedTotal).toBe("3000.00");
    expect(result.totalBudget).toBe("2500.00");
    expect(result.message).toBe(
      "各分类预算合计 3000.00 超出总预算 2500.00，请调整。当前所有分类: 交通=500, 餐饮=2500",
    );
  });

  it("详情里的额度按 0 位小数、四舍六入五成双（与 Python f-string 一致）", () => {
    const result = mergeAndValidateBudgets({
      existing: [
        { category: "餐饮", monthlyLimit: "2000.50" },
        { category: "交通", monthlyLimit: "1000.00" },
      ],
      incoming: [],
      totalBudget: 2000,
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain("餐饮=2000");
    expect(result.message).not.toContain("餐饮=2001");
  });

  it("金额按两位小数归一化（四舍五入到分）", () => {
    const result = mergeAndValidateBudgets({
      existing: [],
      incoming: [{ category: "餐饮", monthlyLimit: "100.126" }],
      totalBudget: 1000,
    });

    expect(toMap(result.merged)).toEqual({ 餐饮: "100.13" });
    expect(result.mergedTotal).toBe("100.13");
  });

  it("小数相加不产生浮点误差", () => {
    const result = mergeAndValidateBudgets({
      existing: [{ category: "餐饮", monthlyLimit: "0.10" }],
      incoming: [{ category: "交通", monthlyLimit: "0.20" }],
      totalBudget: "0.30",
    });

    expect(result.isValid).toBe(true);
    expect(result.mergedTotal).toBe("0.30");
  });

  it("空输入返回合法的 0", () => {
    const result = mergeAndValidateBudgets({ existing: [], incoming: [], totalBudget: 0 });

    expect(result.isValid).toBe(true);
    expect(result.message).toBe("");
    expect(result.merged).toEqual([]);
    expect(result.mergedTotal).toBe("0.00");
  });

  it("多分类时按码点排序输出全部明细", () => {
    const result = mergeAndValidateBudgets({
      existing: [
        { category: "餐饮", monthlyLimit: "1000.00" },
        { category: "交通", monthlyLimit: "1000.00" },
        { category: "购物", monthlyLimit: "1000.00" },
      ],
      incoming: [],
      totalBudget: 100,
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain("交通=1000, 购物=1000, 餐饮=1000");
  });

  it("总预算为 0 而传入分类时判定超支", () => {
    const result = mergeAndValidateBudgets({
      existing: [],
      incoming: [{ category: "餐饮", monthlyLimit: 1 }],
      totalBudget: 0,
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain("超出总预算 0.00");
  });
});

describe("persistMergedBudgets", () => {
  it("校验通过时把合并结果交给写库回调", async () => {
    const write = vi.fn<(merged: readonly MergedCategory[]) => Promise<void>>(async () => {});
    const result = mergeAndValidateBudgets({
      existing,
      incoming: [{ category: "餐饮", monthlyLimit: 2500 }],
      totalBudget: 3000,
    });

    await persistMergedBudgets(result, write);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(result.merged);
  });

  it("校验失败时抛 BUDGET_OVER_ALLOCATED（422）且不写库", async () => {
    const write = vi.fn<(merged: readonly MergedCategory[]) => Promise<void>>(async () => {});
    const result = mergeAndValidateBudgets({
      existing,
      incoming: [{ category: "餐饮", monthlyLimit: 2500 }],
      totalBudget: 2500,
    });

    await expect(persistMergedBudgets(result, write)).rejects.toMatchObject({
      code: "BUDGET_OVER_ALLOCATED",
      status: 422,
      details: { mergedTotal: "3000.00", totalBudget: "2500.00" },
    });
    expect(write).not.toHaveBeenCalled();
  });
});
