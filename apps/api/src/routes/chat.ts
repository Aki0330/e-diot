import { randomUUID } from "node:crypto";

import {
  appendMessage,
  createSession,
  deleteSession,
  findSessionById,
  listMessages,
  listMonthBudgets,
  listSessions,
  listTransactions,
  sumAmountSince,
  sumByCategorySince,
  touchSession,
  type CategoryLimitRow,
} from "@cyberbudget/db";
import {
  AppError,
  centsToNumber,
  chatRequestSchema,
  chatResponseSchema,
  dashboardResponseSchema,
  deleteSessionResponseSchema,
  formatYearMonthUtc,
  monthStartUtc,
  parseCents,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  transactionsResponseSchema,
  type ChatResponse,
  type DashboardResponse,
  type SessionDetailResponse,
  type SessionListResponse,
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

      const trace = await app.agent.runWithTrace(user.userId, body.message);

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
};
