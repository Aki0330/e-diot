import { z } from "zod";

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

export const chatResponseSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
  message: z.string(),
  response: z.string(),
  intent_type: z.string().nullable(),
  graph_path: z.string().nullable(),
  execution_data: executionDataSchema,
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
