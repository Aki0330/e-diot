import { describe, expect, it } from "vitest";

import { catEmoji, fmt, fmtDate, formatContent } from "./format.js";

describe("formatContent", () => {
  it("先转义 HTML，再支持换行/粗体/行内代码", () => {
    expect(formatContent("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(formatContent("第一行\n第二行")).toBe("第一行<br>第二行");
    expect(formatContent("**已记账** 金额 `30` 元")).toBe(
      "<strong>已记账</strong> 金额 <code>30</code> 元",
    );
  });
});

describe("fmt", () => {
  it("千分位且不保留小数（与旧版一致）", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(1234.56)).toBe("1,235");
    expect(fmt(5000)).toBe("5,000");
  });
});

describe("fmtDate", () => {
  it("输出 M/D HH:mm", () => {
    const iso = new Date(2026, 9, 22, 9, 5).toISOString();
    expect(fmtDate(iso)).toBe("10/22 09:05");
  });

  it("空值与非法值返回空串", () => {
    expect(fmtDate("")).toBe("");
    expect(fmtDate("not-a-date")).toBe("");
  });
});

describe("catEmoji", () => {
  it("已知分类有对应 emoji，未知分类用 📌", () => {
    expect(catEmoji("餐饮")).toBe("🍽️");
    expect(catEmoji("交通")).toBe("🚗");
    expect(catEmoji("自创分类")).toBe("📌");
  });
});
