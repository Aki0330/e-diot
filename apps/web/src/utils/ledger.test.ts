import { describe, expect, it } from "vitest";

import {
  allocationSummary,
  budgetProgress,
  dailyAverage,
  ledgerAmount,
  ledgerCents,
} from "./ledger.js";

describe("分类预算展示", () => {
  it.each([
    [799.99, "normal", "<80%"],
    [800, "near", "80%"],
    [999.99, "near", "<100%"],
    [1000, "full", "100%"],
    [1000.01, "over", ">100%"],
  ])("额度 1000、支出 %s 时显示 %s", (spent, state, label) => {
    expect(budgetProgress(spent, 1000)).toMatchObject({ state, label });
  });

  it("未设分类额度时隐藏百分比", () => {
    expect(budgetProgress(20, 0)).toEqual({ state: "unset", label: "未设额度", width: 0 });
  });

  it("流水与汇总都展示到分", () => {
    expect(ledgerAmount(1250.05)).toBe("1,250.05");
    expect(ledgerAmount(8)).toBe("8.00");
    expect(ledgerCents(-1n)).toBe("-0.01");
    expect(ledgerCents(98765432123456789n)).toBe("987,654,321,234,567.89");
  });

  it("一角加两角刚好分完三角预算，多一分钱才算超额", () => {
    expect(allocationSummary(0.3, [0.1, 0.2])).toEqual({ allocated: 30n, label: "已全部分配" });
    expect(allocationSummary(0.3, [0.1, 0.21]).label).toBe("超额分配 ¥0.01");
    expect(allocationSummary(0.3, [0.1, 0.19]).label).toBe("待分配 ¥0.01");
    expect(allocationSummary(0, []).label).toBe("未设月总预算");
  });

  it("日均可用金额遇到半分时进一分", () => {
    expect(dailyAverage(2.01, 2)).toBe(101n);
    expect(dailyAverage(0.01, 7)).toBe(0n);
  });
});
