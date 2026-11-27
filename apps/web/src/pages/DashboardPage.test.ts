import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardData } from "../api/types.js";
import { DashboardReport } from "./DashboardPage.js";

vi.mock("../api/client.js", () => ({ api: {} }));

const empty: DashboardData = {
  user_id: "test",
  year_month: "2026-11",
  total_budget: 0,
  total_income: 0,
  total_spent: 0,
  remaining: 0,
  categories: [],
  recent_transactions: [],
  activity: { expense_count: 0, recorded_days: 0, last_seven_days: [], seven_day_spent: 0 },
};

describe("总览账本", () => {
  it("没有流水和预算时交代空数据与未设额度", () => {
    const report = renderToStaticMarkup(createElement(DashboardReport, { data: empty }));
    expect(report).toContain("本月暂无分类支出或预算");
    expect(report).toContain("记下第一笔后");
    expect(report).toContain("未设月总预算");
    expect(report).not.toContain("各分类已用额度均低于 80%");
  });

  it("分类百分比四舍五入至 100% 时按实际金额判断并保留分", () => {
    const data: DashboardData = {
      ...empty,
      total_budget: 1000,
      total_spent: 1000.01,
      remaining: -0.01,
      categories: [{ category: "餐饮", budget: 1000, spent: 1000.01, percentage: 100 }],
    };
    const report = renderToStaticMarkup(createElement(DashboardReport, { data }));
    expect(report).toContain("超出 ¥0.01");
    expect(report).toContain("1,000.01");
  });
});
