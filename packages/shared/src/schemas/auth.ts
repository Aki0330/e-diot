import { z } from "zod";

import { positiveMoneySchema } from "./common.js";

/**
 * 认证相关请求/响应（对应旧 `backend/schemas/auth.py`）。
 *
 * ⚠️ 字段名保持 snake_case：这是旧前端与现有 API 契约的唯一写法，
 * 内部领域对象可以用 camelCase，但网络层必须原样输出。
 */

/** 手机号：7-15 位数字，可选 `+` 前缀（旧 pattern `^\+?\d{7,15}$`） */
export const phoneNumSchema = z
  .string()
  .regex(/^\+?\d{7,15}$/, "手机号格式不正确（7-15 位数字，可选 + 前缀）");

export const emailSchema = z.email("邮箱格式不正确");

export const registerRequestSchema = z
  .object({
    username: z
      .string()
      .min(3, "用户名长度需在 3-50 个字符之间")
      .max(50, "用户名长度需在 3-50 个字符之间"),
    phone_num: phoneNumSchema.nullish(),
    email: emailSchema.nullish(),
    password: z
      .string()
      .min(6, "密码长度需在 6-128 个字符之间")
      .max(128, "密码长度需在 6-128 个字符之间"),
  })
  .refine((value) => Boolean(value.phone_num) || Boolean(value.email), {
    message: "必须提供 phone_num 或 email 中至少一项",
    path: ["phone_num"],
  });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/** 登录：account 自动识别手机号 / 邮箱（旧实现按是否含 `@` 判断） */
export const loginRequestSchema = z.object({
  account: z.string().min(1, "账号不能为空"),
  password: z.string().min(1, "密码不能为空"),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string().default("bearer"),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const refreshRequestSchema = z.object({
  refresh_token: z.string().min(1, "refresh_token 不能为空"),
});

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const setBudgetRequestSchema = z.object({
  budget: z.coerce
    .number()
    .nonnegative("月度预算不能为负")
    .refine(
      (value) => value === 0 || positiveMoneySchema.safeParse(value).success,
      "月度预算超出可存储范围",
    ),
});

export type SetBudgetRequest = z.infer<typeof setBudgetRequestSchema>;

export const userProfileResponseSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  phone_num: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  budget: z.number(),
  is_active: z.boolean(),
  created_at: z.string().nullable().optional(),
  /** 用户自配的 LLM base_url（不含密钥） */
  llm_base_url: z.string().nullable().optional(),
  has_llm_key: z.boolean().optional(),
});

export type UserProfileResponse = z.infer<typeof userProfileResponseSchema>;

/** 用户级 LLM 配置（密钥只回传「是否已配置」，绝不回传明文） */
export const llmConfigResponseSchema = z.object({
  base_url: z.string().nullable(),
  has_api_key: z.boolean(),
  model: z.string(),
});

export type LlmConfigResponse = z.infer<typeof llmConfigResponseSchema>;

const llmBaseUrlSchema = z
  .string()
  .max(255, "base_url 最长 255 个字符")
  .refine(
    (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
    "base_url 必须是 http(s) URL，留空表示清除",
  );

export const updateLlmConfigRequestSchema = z
  .object({
    /** 传空字符串表示清除；不传表示保持原值 */
    base_url: llmBaseUrlSchema.nullable().optional(),
    /** 传空字符串表示清除；不传表示保持原值 */
    api_key: z.string().max(500, "api_key 最长 500 个字符").nullable().optional(),
  })
  .refine((value) => value.base_url !== undefined || value.api_key !== undefined, {
    message: "至少提供一个字段",
  });

export type UpdateLlmConfigRequest = z.infer<typeof updateLlmConfigRequestSchema>;
