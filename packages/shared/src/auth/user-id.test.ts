import { describe, expect, it } from "vitest";

import { generateUserId, USER_NAMESPACE, uuidv5 } from "./user-id.js";

describe("uuidv5", () => {
  it("符合 RFC 4122 附录 A 的 DNS 命名空间测试向量", () => {
    expect(uuidv5(USER_NAMESPACE, "www.example.com")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });

  it("格式固定为 8-4-4-4-12 的十六进制", () => {
    expect(uuidv5(USER_NAMESPACE, "任意中文名称")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("拒绝非法命名空间", () => {
    expect(() => uuidv5("not-a-uuid", "x")).toThrow("无效的 UUID 命名空间");
  });
});

describe("generateUserId", () => {
  // 基准来自旧库真实记录：users.user_id = usr_8e520ac15a6b5fce，phone_num = 13713331777
  it("与旧库真实 user_id 完全一致", () => {
    expect(generateUserId({ phoneNum: "13713331777" })).toBe("usr_8e520ac15a6b5fce");
  });

  it("手机号优先于邮箱", () => {
    expect(generateUserId({ phoneNum: "13713331777", email: "user@example.com" })).toBe(
      "usr_8e520ac15a6b5fce",
    );
  });

  it("只给邮箱时用邮箱生成", () => {
    expect(generateUserId({ email: "user@example.com" })).toMatch(/^usr_[0-9a-f]{16}$/);
    expect(generateUserId({ email: "user@example.com" })).not.toBe(
      generateUserId({ phoneNum: "13713331777" }),
    );
  });

  it("去空格并转小写（等价旧 .strip().lower()）", () => {
    expect(generateUserId({ email: "  User@Example.COM " })).toBe(
      generateUserId({ email: "user@example.com" }),
    );
  });

  it("空字符串手机号会回退到邮箱（等价旧 `phone_num or email`）", () => {
    expect(generateUserId({ phoneNum: "", email: "user@example.com" })).toBe(
      generateUserId({ email: "user@example.com" }),
    );
  });

  it("联系方式为空时抛错", () => {
    expect(() => generateUserId({})).toThrow("手机号和邮箱不能同时为空");
    expect(() => generateUserId({ phoneNum: "", email: null })).toThrow("手机号和邮箱不能同时为空");
    expect(() => generateUserId({ phoneNum: "   " })).toThrow("手机号和邮箱不能同时为空");
  });

  it("输出格式固定为 usr_ + 16 位十六进制", () => {
    expect(generateUserId({ phoneNum: "13800138000" })).toMatch(/^usr_[0-9a-f]{16}$/);
  });
});
