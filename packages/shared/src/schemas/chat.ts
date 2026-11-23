import { z } from "zod";

import { positiveMoneySchema } from "./common.js";

/**
 * 对话 / 会话 / 仪表盘 / 交易列表的请求与响应 schema。
 * 字段名全部 snake_case，与旧前端 `frontend/js/app.js` 读取的字段保持一致。
 */

/** 对话请求（对应旧 `backend/api/v1/chat.py` 的 ChatRequest） */
export const chatRequestSchema = z.object({
  message: z.string().min(1, "消息不能为空"),
  session_id: z.string().min(1).nullish(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** JSONB 执行数据：对象或 null（旧库该列可空） */
export const executionDataSchema = z.record(z.string(), z.unknown()).nullable();

/**
 * 知识库引用（P4b 新增）：本轮回答参考的片段，分数已保留四位小数，前端可直接展示。
 */
export const knowledgeCitationSchema = z.object({
  content: z.string(),
  category: z.string(),
  score: z.number(),
  tags: z.array(z.string()).default([]),
});

export type KnowledgeCitation = z.infer<typeof knowledgeCitationSchema>;

export const chatResponseSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
  message: z.string(),
  response: z.string(),
  intent_type: z.string().nullable(),
  graph_path: z.string().nullable(),
  execution_data: executionDataSchema,
  /** 本轮回答引用的知识库片段；未检索到或未启用时为空数组 */
  citations: z.array(knowledgeCitationSchema).default([]),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export const sessionItemSchema = z.object({
  session_id: z.string(),
  title: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SessionItem = z.infer<typeof sessionItemSchema>;

export const sessionListResponseSchema = z.object({
  user_id: z.string(),
  sessions: z.array(sessionItemSchema),
});

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

export const chatMessageItemSchema = z.object({
  message_id: z.number(),
  role: z.string(),
  content: z.string(),
  is_proactive: z.boolean().optional().default(false),
  intent_type: z.string().nullable(),
  graph_path: z.string().nullable(),
  execution_data: executionDataSchema,
  created_at: z.string(),
});

export type ChatMessageItem = z.infer<typeof chatMessageItemSchema>;

export const sessionDetailResponseSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
  title: z.string(),
  messages: z.array(chatMessageItemSchema),
});

export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;

export const deleteSessionResponseSchema = z.object({
  deleted: z.string(),
});

export const transactionItemDtoSchema = z.object({
  transaction_id: z.number(),
  amount: z.number(),
  category: z.string(),
  type: z.string().nullable(),
  note: z.string().nullable(),
  transaction_time: z.string(),
});

export type TransactionItemDto = z.infer<typeof transactionItemDtoSchema>;

export const transactionsResponseSchema = z.object({
  user_id: z.string(),
  total: z.number(),
  transactions: z.array(transactionItemDtoSchema),
});

export type TransactionsResponse = z.infer<typeof transactionsResponseSchema>;

/**
 * 交易更新（P6 补全的 CRUD）：部分字段更新，至少提供一个字段。
 * `note` 允许显式置空（null），其余字段不接受 null。
 */
export const updateTransactionRequestSchema = z
  .object({
    amount: positiveMoneySchema.optional(),
    type: z.enum(["EXPENSE", "INCOME"]).optional(),
    category: z.string().min(1, "分类不能为空").max(50, "分类最长 50 个字符").optional(),
    note: z.string().max(2000, "备注最长 2000 个字符").nullable().optional(),
    transaction_time: z.coerce.date().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "至少提供一个要更新的字段",
  });

export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;

export const deleteTransactionResponseSchema = z.object({
  deleted: z.number().int().positive(),
});

export type DeleteTransactionResponse = z.infer<typeof deleteTransactionResponseSchema>;

/** 手动新增账单（区别于 Agent 自动记账） */
export const createTransactionRequestSchema = z.object({
  amount: positiveMoneySchema,
  type: z.enum(["EXPENSE", "INCOME"]),
  category: z.string().min(1, "分类不能为空").max(50, "分类最长 50 个字符"),
  note: z.string().max(2000, "备注最长 2000 个字符").nullable().optional(),
  transaction_time: z.coerce.date().optional(),
});

export type CreateTransactionRequest = z.infer<typeof createTransactionRequestSchema>;

export const dashboardCategorySchema = z.object({
  category: z.string(),
  spent: z.number(),
  budget: z.number(),
  percentage: z.number(),
});

export const dashboardResponseSchema = z.object({
  user_id: z.string(),
  year_month: z.string(),
  total_budget: z.number(),
  total_spent: z.number(),
  total_income: z.number(),
  remaining: z.number(),
  categories: z.array(dashboardCategorySchema),
  recent_transactions: z.array(transactionItemDtoSchema),
});

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
