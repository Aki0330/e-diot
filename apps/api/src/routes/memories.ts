import {
  confirmMemory,
  createMemory,
  deleteMemory,
  findMemoryById,
  findMessageForUser,
  findTransactionById,
  listMemories,
  updateMemory,
  type MemoryRow,
} from "@cyberbudget/db";
import {
  AppError,
  MEMORY_STATUSES,
  createMemoryRequestSchema,
  memoryBasisResponseSchema,
  memoryListResponseSchema,
  updateMemoryRequestSchema,
  type MemoryBasisResponse,
  type MemoryItem,
  type MemoryListResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { toTransactionDto } from "../serializers.js";
import { currentUser, requireActiveUser } from "../services/users.js";

const memoryParamsSchema = z.object({ memory_id: z.string().uuid("memory_id 必须是 UUID") });

const listQuerySchema = z.object({
  status: z.enum(MEMORY_STATUSES).optional(),
});

function toMemoryItem(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    type: row.type as MemoryItem["type"],
    content: row.content,
    source: row.source as MemoryItem["source"],
    source_ref: row.sourceRef,
    status: row.status as MemoryItem["status"],
    confidence: Number(row.confidence ?? 1),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    deleted_at: row.deletedAt?.toISOString() ?? null,
  };
}

export const memoryRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/v1/memories —— 默认返回 pending + active
  app.get(
    "/memories",
    {
      preHandler: app.authenticate,
      schema: { querystring: listQuerySchema, response: { 200: memoryListResponseSchema } },
    },
    async (request): Promise<MemoryListResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const rows = await listMemories(app.db, user.userId, request.query.status);
      return { memories: rows.map(toMemoryItem) };
    },
  );

  // POST /api/v1/memories —— 新建后为 pending，确认后才注入 Agent
  app.post(
    "/memories",
    { preHandler: app.authenticate, schema: { body: createMemoryRequestSchema } },
    async (request) => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const row = await createMemory(app.db, user.userId, {
        type: request.body.type,
        content: request.body.content.trim(),
        source: "manual",
        sourceRef: request.body.source_ref ?? null,
        status: "pending",
      });
      return toMemoryItem(row);
    },
  );

  // POST /api/v1/memories/:memory_id/confirm
  app.post(
    "/memories/:memory_id/confirm",
    { preHandler: app.authenticate, schema: { params: memoryParamsSchema } },
    async (request) => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const updated = await confirmMemory(app.db, user.userId, request.params.memory_id);
      if (updated === undefined) throw new AppError("NOT_FOUND", "记忆不存在");
      return toMemoryItem(updated);
    },
  );

  // PATCH /api/v1/memories/:memory_id —— 纠正内容/类型
  app.patch(
    "/memories/:memory_id",
    {
      preHandler: app.authenticate,
      schema: { params: memoryParamsSchema, body: updateMemoryRequestSchema },
    },
    async (request) => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const updated = await updateMemory(app.db, user.userId, request.params.memory_id, {
        ...(request.body.type === undefined ? {} : { type: request.body.type }),
        ...(request.body.content === undefined ? {} : { content: request.body.content.trim() }),
      });
      if (updated === undefined) throw new AppError("NOT_FOUND", "记忆不存在");
      return toMemoryItem(updated);
    },
  );

  // DELETE /api/v1/memories/:memory_id —— 软删除
  app.delete(
    "/memories/:memory_id",
    {
      preHandler: app.authenticate,
      schema: {
        params: memoryParamsSchema,
        response: { 200: z.object({ deleted: z.string() }) },
      },
    },
    async (request) => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const deleted = await deleteMemory(app.db, user.userId, request.params.memory_id);
      if (!deleted) throw new AppError("NOT_FOUND", "记忆不存在");
      return { deleted: request.params.memory_id };
    },
  );

  // GET /api/v1/memories/:memory_id/basis —— 查看依据
  app.get(
    "/memories/:memory_id/basis",
    {
      preHandler: app.authenticate,
      schema: {
        params: memoryParamsSchema,
        response: { 200: memoryBasisResponseSchema },
      },
    },
    async (request): Promise<MemoryBasisResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const memory = await findMemoryById(app.db, user.userId, request.params.memory_id);
      if (memory === undefined) throw new AppError("NOT_FOUND", "记忆不存在");

      const basis: MemoryBasisResponse = {
        memory_id: memory.id,
        source: memory.source as MemoryBasisResponse["source"],
        source_ref: memory.sourceRef,
        transaction: null,
        message: null,
        note: null,
      };

      if (memory.source === "transaction" && memory.sourceRef !== null) {
        const transactionId = Number(memory.sourceRef);
        if (Number.isInteger(transactionId)) {
          const row = await findTransactionById(app.db, user.userId, transactionId);
          if (row !== undefined) basis.transaction = toTransactionDto(row);
        }
      }

      if (memory.source === "conversation" && memory.sourceRef !== null) {
        const messageId = Number(memory.sourceRef);
        if (Number.isInteger(messageId)) {
          const row = await findMessageForUser(app.db, user.userId, messageId);
          if (row !== undefined) {
            basis.message = {
              message_id: row.messageId,
              role: row.role,
              content: row.content,
              created_at: row.createdAt.toISOString(),
            };
          }
        }
      }

      if (memory.source === "manual") basis.note = "由你手动创建";
      return basis;
    },
  );
};
