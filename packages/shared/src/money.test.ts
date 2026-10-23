import { describe, expect, it } from "vitest";

import {
  formatCents,
  formatMoney,
  moneyEq,
  moneyGt,
  moneySum,
  parseCents,
  toMoneyNumber,
} from "./money.js";

describe("parseCents", () => {
  it("解析两位小数金额", () => {
    expect(parseCents("1234.56")).toBe(123456n);
    expect(parseCents("0.01")).toBe(1n);
    expect(parseCents("0")).toBe(0n);
    expect(parseCents("-12.34")).toBe(-1234n);
    expect(parseCents("+12.34")).toBe(1234n);
  });

  it("缺少小数位时补零", () => {
    expect(parseCents("2000")).toBe(200000n);
    expect(parseCents("2000.")).toBe(200000n);
    expect(() => parseCents(".5")).toThrow("无效金额");
  });

  it("超过两位小数按四舍五入（0.5 远离零）", () => {
    expect(parseCents("1.234")).toBe(123n);
    expect(parseCents("1.235")).toBe(124n);
    expect(parseCents("-1.235")).toBe(-124n);
    expect(parseCents("0.005")).toBe(1n);
  });

  it("number 输入按十进制字面量解析，不引入浮点误差", () => {
    expect(parseCents(0.1)).toBe(10n);
    expect(parseCents(0.1) + parseCents(0.2)).toBe(30n);
    expect(parseCents(2500)).toBe(250000n);
  });

  it("拒绝非法输入", () => {
    expect(() => parseCents("abc")).toThrow("无效金额");
    expect(() => parseCents("1e3")).toThrow("无效金额");
    expect(() => parseCents(1e21)).toThrow("科学计数法");
    expect(() => parseCents(Number.NaN)).toThrow("无效金额");
    expect(() => parseCents(Number.POSITIVE_INFINITY)).toThrow("无效金额");
  });
});

describe("formatCents", () => {
  it("默认两位小数", () => {
    expect(formatCents(123456n)).toBe("1234.56");
    expect(formatCents(1n)).toBe("0.01");
    expect(formatCents(0n)).toBe("0.00");
    expect(formatCents(-1234n)).toBe("-12.34");
  });

  it("两位小数时不做舍入（分本身就是最小单位）", () => {
    expect(formatCents(1999n)).toBe("19.99");
    expect(formatCents(100n)).toBe("1.00");
  });

  it("formatMoney 直接格式化金额输入", () => {
    expect(formatMoney("1234.5")).toBe("1234.50");
    expect(formatMoney(0)).toBe("0.00");
    expect(formatMoney("2.345")).toBe("2.35");
  });

  it("取整时四舍六入五成双（与 Python f-string 一致）", () => {
    expect(formatCents(200050n, 0)).toBe("2000"); // 2000.50 → 2000（偶数）
    expect(formatCents(200150n, 0)).toBe("2002"); // 2001.50 → 2002（偶数）
    expect(formatCents(200051n, 0)).toBe("2001"); // 2000.51 → 2001
    expect(formatCents(200049n, 0)).toBe("2000"); // 2000.49 → 2000
    expect(formatCents(-200050n, 0)).toBe("-2000");
  });
});

describe("money 工具", () => {
  it("求和精确（0.1 + 0.2 = 0.3）", () => {
    expect(moneySum(["0.1", "0.2"])).toBe(30n);
    expect(formatCents(moneySum(["0.1", "0.2"]))).toBe("0.30");
  });

  it("混合字符串/数字求和", () => {
    expect(moneySum(["2000.00", 500, "0.5"])).toBe(250050n);
  });

  it("比较按数值", () => {
    expect(moneyGt("1000.00", "999.99")).toBe(true);
    expect(moneyGt("999.99", "1000.00")).toBe(false);
    expect(moneyEq("1000.0", "1000.00")).toBe(true);
    expect(moneyEq("1000.001", "1000.00")).toBe(true); // 解析时已按分舍入
  });

  it("导出 number 保持两位小数的值", () => {
    expect(toMoneyNumber("1234.56")).toBe(1234.56);
    expect(toMoneyNumber("0.1")).toBeCloseTo(0.1, 10);
  });

  it("空数组求和为 0", () => {
    expect(moneySum([])).toBe(0n);
  });
});
