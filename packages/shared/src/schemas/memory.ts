import { z } from "zod";

import { transactionItemDtoSchema } from "./chat.js";

/** 记忆类型：偏好 / 目标 / 习惯 / 边界 */
export const MEMORY_TYPES = ["preference", "goal", "habit", "boundary"] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];

/** 来源：对话 / 交易 / 手动 */
export const MEMORY_SOURCES = ["conversation", "transaction", "manual"] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export const MEMORY_STATUSES = ["pending", "active", "deleted"] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  preference: "偏好",
  goal: "目标",
  habit: "习惯",
  boundary: "边界",
};

/** 注入时的类型优先级（越小越优先） */
export const MEMORY_TYPE_PRIORITY: Record<MemoryType, number> = {
  boundary: 0,
  goal: 1,
  preference: 2,
  habit: 3,
};

export const memoryItemSchema = z.object({
  id: z.string(),
  type: z.enum(MEMORY_TYPES),
  content: z.string(),
  source: z.enum(MEMORY_SOURCES),
  source_ref: z.string().nullable(),
  status: z.enum(MEMORY_STATUSES),
  confidence: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export type MemoryItem = z.infer<typeof memoryItemSchema>;

export const memoryListResponseSchema = z.object({
  memories: z.array(memoryItemSchema),
});

export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

export const createMemoryRequestSchema = z.object({
  type: z.enum(MEMORY_TYPES),
  content: z.string().min(1, "内容不能为空").max(500, "内容最长 500 个字符"),
  source_ref: z.string().max(128).nullish(),
});

export type CreateMemoryRequest = z.infer<typeof createMemoryRequestSchema>;

export const updateMemoryRequestSchema = z
  .object({
    type: z.enum(MEMORY_TYPES).optional(),
    content: z.string().min(1, "内容不能为空").max(500, "内容最长 500 个字符").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "至少提供一个字段" });

export type UpdateMemoryRequest = z.infer<typeof updateMemoryRequestSchema>;

export const memoryBasisResponseSchema = z.object({
  memory_id: z.string(),
  source: z.enum(MEMORY_SOURCES),
  source_ref: z.string().nullable(),
  transaction: transactionItemDtoSchema.nullish(),
  message: z
    .object({
      message_id: z.number(),
      role: z.string(),
      content: z.string(),
      created_at: z.string(),
    })
    .nullish(),
  note: z.string().nullable(),
});

export type MemoryBasisResponse = z.infer<typeof memoryBasisResponseSchema>;
