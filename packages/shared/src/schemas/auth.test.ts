import { describe, expect, it } from "vitest";

import { loginRequestSchema, registerRequestSchema } from "./auth.js";

describe("registerRequestSchema", () => {
  it("接受手机号注册", () => {
    const parsed = registerRequestSchema.parse({
      username: "alice",
      phone_num: "13800138000",
      password: "secret1",
    });

    expect(parsed.phone_num).toBe("13800138000");
  });

  it("接受邮箱注册（手机号缺省）", () => {
    const parsed = registerRequestSchema.parse({
      username: "bob",
      email: "bob@example.com",
      password: "secret1",
    });

    expect(parsed.email).toBe("bob@example.com");
  });

  it("手机号与邮箱都不提供时拒绝", () => {
    const result = registerRequestSchema.safeParse({
      username: "carol",
      password: "secret1",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("必须提供 phone_num 或 email 中至少一项");
    }
  });

  it("拒绝过短用户名与密码", () => {
    expect(
      registerRequestSchema.safeParse({
        username: "ab",
        phone_num: "13800138000",
        password: "secret1",
      }).success,
    ).toBe(false);

    expect(
      registerRequestSchema.safeParse({
        username: "alice",
        phone_num: "13800138000",
        password: "123",
      }).success,
    ).toBe(false);
  });

  it("拒绝非法手机号", () => {
    expect(
      registerRequestSchema.safeParse({
        username: "alice",
        phone_num: "138-0013-8000",
        password: "secret1",
      }).success,
    ).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("接受手机号或邮箱作为 account", () => {
    expect(loginRequestSchema.parse({ account: "13800138000", password: "x" }).account).toBe(
      "13800138000",
    );
    expect(loginRequestSchema.parse({ account: "a@b.com", password: "x" }).account).toBe("a@b.com");
  });

  it("拒绝空账号", () => {
    expect(loginRequestSchema.safeParse({ account: "", password: "x" }).success).toBe(false);
  });
});
