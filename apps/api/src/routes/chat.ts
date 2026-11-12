import { randomUUID } from "node:crypto";

import {
  appendMessage,
  createSession,
  deleteSession,
  deleteTransaction,
  findSessionById,
  getUserSettings,
  listActiveMemories,
  listMessages,
  listMonthBudgets,
  listSessions,
  listTransactions,
  sumAmountSince,
  sumByCategorySince,
  touchSession,
  updateTransaction,
  type CategoryLimitRow,
  type TransactionPatch,
} from "@cyberbudget/db";
import {
  AppError,
  centsToNumber,
  chatRequestSchema,
  chatResponseSchema,
  dashboardResponseSchema,
  deleteSessionResponseSchema,
  deleteTransactionResponseSchema,
  formatCents,
  formatYearMonthUtc,
  MEMORY_TYPE_PRIORITY,
  monthStartUtc,
  parseCents,
  PERSONAS,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  transactionItemDtoSchema,
  transactionsResponseSchema,
  updateTransactionRequestSchema,
  type ChatResponse,
  type DashboardResponse,
  type DeleteTransactionResponse,
  type MemoryType,
  type SessionDetailResponse,
  type SessionListResponse,
  type TransactionItemDto,
  type TransactionsResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { toChatMessageItem, toSessionItem, toTransactionDto } from "../serializers.js";
import { currentUser, requireActiveUser } from "../services/users.js";

const sessionParamsSchema = z.object({ session_id: z.string().min(1) });

const transactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  category: z.string().default(""),
});

const transactionParamsSchema = z.object({
  transaction_id: z.coerce.number().int().positive(),
});

function percentageOf(spent: string, budget: string): number {
  const spentCents = parseCents(spent);
  const budgetCents = parseCents(budget);
  if (budgetCents <= 0n) return 0;
  // 与旧实现一致：round(spent / budget * 100, 1)
  return Math.round((Number(spentCents) / Number(budgetCents)) * 1000) / 10;
}

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/v1/chat —— 对话 + 持久化会话与执行追踪
  app.post(
    "/chat",
    {
      preHandler: app.authenticate,
      schema: { body: chatRequestSchema, response: { 200: chatResponseSchema } },
    },
    async (request): Promise<ChatResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const body = request.body;
      const now = new Date();

      const requestedSessionId = body.session_id ?? null;
      let sessionId: string;
      let isNew = false;

      if (requestedSessionId !== null) {
        const session = await findSessionById(app.db, user.userId, requestedSessionId);
        if (session === undefined) {
          throw new AppError("CHAT_SESSION_NOT_FOUND", "会话不存在");
        }
        sessionId = requestedSessionId;
      } else {
        // 旧实现用 uuid4().hex（32 位、无连字符）
        sessionId = randomUUID().replaceAll("-", "");
        isNew = true;
        await createSession(app.db, {
          sessionId,
          userId: user.userId,
          title: body.message.slice(0, 80),
        });
      }

      await appendMessage(app.db, { sessionId, role: "user", content: body.message });

      const historyRows = await listMessages(app.db, sessionId);
      const history = historyRows
        .filter((row) => row.content.trim() !== "")
        .slice(-12)
        .map((row) => ({
          role: row.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: row.content,
        }));
      // 去掉刚刚写入的当前用户消息，避免与最后一条输入重复
      history.pop();

      const settings = await getUserSettings(app.db, user.userId);
      const persona = PERSONAS.find((item) => item === settings?.persona);

      const activeMemories = await listActiveMemories(app.db, user.userId);
      const memories = [...activeMemories]
        .sort((left, right) => {
          const leftPriority = MEMORY_TYPE_PRIORITY[left.type as MemoryType] ?? 9;
          const rightPriority = MEMORY_TYPE_PRIORITY[right.type as MemoryType] ?? 9;
          return leftPriority - rightPriority;
        })
        .slice(0, 8)
        .map((memory) => ({ type: memory.type, content: memory.content }));

      const trace = await app.agent.runWithTrace(user.userId, body.message, {
        history,
        ...(persona === undefined ? {} : { persona }),
        ...(memories.length === 0 ? {} : { memories }),
      });

      await appendMessage(app.db, {
        sessionId,
        role: "assistant",
        content: trace.response,
        intentType: trace.intentType,
        graphPath: trace.graphPath,
        executionData: trace.executionData,
      });

      await touchSession(app.db, sessionId, {
        at: now,
        ...(isNew ? { title: body.message.slice(0, 80) } : {}),
      });

      return {
        session_id: sessionId,
        user_id: user.userId,
        message: body.message,
        response: trace.response,
        intent_type: trace.intentType,
        graph_path: trace.graphPath,
        execution_data: trace.executionData,
      };
    },
  );

  // GET /api/v1/chat/sessions
  app.get(
    "/chat/sessions",
    {
      preHandler: app.authenticate,
      schema: { response: { 200: sessionListResponseSchema } },
    },
    async (request): Promise<SessionListResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const sessions = await listSessions(app.db, user.userId);
      return { user_id: user.userId, sessions: sessions.map(toSessionItem) };
    },
  );

  // GET /api/v1/chat/sessions/:session_id
  app.get(
    "/chat/sessions/:session_id",
    {
      preHandler: app.authenticate,
      schema: { params: sessionParamsSchema, response: { 200: sessionDetailResponseSchema } },
    },
    async (request): Promise<SessionDetailResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const session = await findSessionById(app.db, user.userId, request.params.session_id);
      if (session === undefined) {
        throw new AppError("CHAT_SESSION_NOT_FOUND", "会话不存在");
      }

      const messages = await listMessages(app.db, session.sessionId);
      return {
        session_id: session.sessionId,
        user_id: user.userId,
        title: session.title,
        messages: messages.map(toChatMessageItem),
      };
    },
  );

  // DELETE /api/v1/chat/sessions/:session_id
  app.delete(
    "/chat/sessions/:session_id",
    {
      preHandler: app.authenticate,
      schema: { params: sessionParamsSchema, response: { 200: deleteSessionResponseSchema } },
    },
    async (request): Promise<{ deleted: string }> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const deleted = await deleteSession(app.db, user.userId, request.params.session_id);
      if (!deleted) {
        throw new AppError("CHAT_SESSION_NOT_FOUND", "会话不存在");
      }
      return { deleted: request.params.session_id };
    },
  );

  // GET /api/v1/chat/dashboard —— 当月总览（UTC 口径）
  app.get(
    "/chat/dashboard",
    {
      preHandler: app.authenticate,
      schema: { response: { 200: dashboardResponseSchema } },
    },
    async (request): Promise<DashboardResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const now = new Date();
      const yearMonth = formatYearMonthUtc(now);
      const since = monthStartUtc(now);

      const [totalSpent, totalIncome, spendingRows, budgetRows, recent] = await Promise.all([
        sumAmountSince(app.db, { userId: user.userId, type: "EXPENSE", since }),
        sumAmountSince(app.db, { userId: user.userId, type: "INCOME", since }),
        sumByCategorySince(app.db, { userId: user.userId, type: "EXPENSE", since }),
        listMonthBudgets(app.db, user.userId, yearMonth),
        listTransactions(app.db, { userId: user.userId, limit: 10 }),
      ]);

      const spendingByCategory = new Map(spendingRows.map((row) => [row.category, row.total]));
      const budgetByCategory = new Map<string, string>(
        budgetRows.map((row: CategoryLimitRow) => [row.category, row.monthlyLimit]),
      );
      const allCategories = [
        ...new Set([...spendingByCategory.keys(), ...budgetByCategory.keys()]),
      ];

      const categories = allCategories.sort().map((category) => {
        const spent = spendingByCategory.get(category) ?? "0";
        const budget = budgetByCategory.get(category) ?? "0";
        return {
          category,
          spent: centsToNumber(parseCents(spent)),
          budget: centsToNumber(parseCents(budget)),
          percentage: percentageOf(spent, budget),
        };
      });

      const totalBudgetCents = parseCents(user.monthlyBudget ?? "0");
      const totalSpentCents = parseCents(totalSpent);

      return {
        user_id: user.userId,
        year_month: yearMonth,
        total_budget: centsToNumber(totalBudgetCents),
        total_spent: centsToNumber(totalSpentCents),
        total_income: centsToNumber(parseCents(totalIncome)),
        remaining: centsToNumber(totalBudgetCents - totalSpentCents),
        categories,
        recent_transactions: recent.map(toTransactionDto),
      };
    },
  );

  // GET /api/v1/chat/transactions
  app.get(
    "/chat/transactions",
    {
      preHandler: app.authenticate,
      schema: {
        querystring: transactionsQuerySchema,
        response: { 200: transactionsResponseSchema },
      },
    },
    async (request): Promise<TransactionsResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const { limit, category } = request.query;

      const rows = await listTransactions(app.db, {
        userId: user.userId,
        limit,
        ...(category === "" ? {} : { category }),
      });

      return {
        user_id: user.userId,
        total: rows.length,
        transactions: rows.map(toTransactionDto),
      };
    },
  );

  // PATCH /api/v1/chat/transactions/:transaction_id —— 部分字段更新（P6 补全）
  app.patch(
    "/chat/transactions/:transaction_id",
    {
      preHandler: app.authenticate,
      schema: {
        params: transactionParamsSchema,
        body: updateTransactionRequestSchema,
        response: { 200: transactionItemDtoSchema },
      },
    },
    async (request): Promise<TransactionItemDto> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const body = request.body;

      const patch: TransactionPatch = {
        ...(body.amount === undefined ? {} : { amount: formatCents(parseCents(body.amount)) }),
        ...(body.type === undefined ? {} : { type: body.type }),
        ...(body.category === undefined ? {} : { category: body.category }),
        ...(body.note === undefined ? {} : { note: body.note }),
        ...(body.transaction_time === undefined ? {} : { transactionTime: body.transaction_time }),
      };

      const updated = await updateTransaction(
        app.db,
        user.userId,
        request.params.transaction_id,
        patch,
      );
      if (updated === undefined) {
        throw new AppError("NOT_FOUND", "交易不存在");
      }
      return toTransactionDto(updated);
    },
  );

  // DELETE /api/v1/chat/transactions/:transaction_id
  app.delete(
    "/chat/transactions/:transaction_id",
    {
      preHandler: app.authenticate,
      schema: {
        params: transactionParamsSchema,
        response: { 200: deleteTransactionResponseSchema },
      },
    },
    async (request): Promise<DeleteTransactionResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const deleted = await deleteTransaction(app.db, user.userId, request.params.transaction_id);
      if (!deleted) {
        throw new AppError("NOT_FOUND", "交易不存在");
      }
      return { deleted: request.params.transaction_id };
    },
  );
};
