import { saveCategoryBudgets } from "@cyberbudget/db";
import {
  agentBudgetRequestSchema,
  budgetResponseSchema,
  centsToNumber,
  formatYearMonthUtc,
  manualBudgetRequestSchema,
  parseCents,
  type BudgetResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { currentUser, requireActiveUser } from "../services/users.js";

interface CategoryLimit {
  readonly category: string;
  readonly monthlyLimit: string;
}

function buildBudgetResponse(
  userId: string,
  yearMonth: string,
  totalBudget: string,
  rows: readonly CategoryLimit[],
): BudgetResponse {
  const total = parseCents(totalBudget);
  const allocated = rows.reduce((sum, row) => sum + parseCents(row.monthlyLimit), 0n);

  return {
    user_id: userId,
    year_month: yearMonth,
    total_budget: centsToNumber(total),
    categories: rows.map((row) => ({
      category: row.category,
      monthly_limit: centsToNumber(parseCents(row.monthlyLimit)),
    })),
    total_allocated: centsToNumber(allocated),
    remaining_unallocated: centsToNumber(total - allocated),
    is_valid: allocated <= total,
  };
}

export const budgetRoutes: FastifyPluginAsyncZod = async (app) => {
  // POST /api/v1/budget/agent —— Agent 解析 + MERGE 语义
  app.post(
    "/budget/agent",
    {
      preHandler: app.authenticate,
      schema: { body: agentBudgetRequestSchema, response: { 200: budgetResponseSchema } },
    },
    async (request): Promise<BudgetResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));

      const categories = await app.agent.parseBudget(user.userId, request.body.user_input);
      const yearMonth = formatYearMonthUtc();
      const saved = await saveCategoryBudgets(app.db, {
        userId: user.userId,
        yearMonth,
        categories: categories.map((item) => ({
          category: item.category,
          monthlyLimit: item.monthly_limit,
        })),
        mode: "merge",
      });
      return buildBudgetResponse(user.userId, yearMonth, saved.totalBudget, saved.merged);
    },
  );

  // POST /api/v1/budget/manual —— 全量替换语义
  app.post(
    "/budget/manual",
    {
      preHandler: app.authenticate,
      schema: { body: manualBudgetRequestSchema, response: { 200: budgetResponseSchema } },
    },
    async (request): Promise<BudgetResponse> => {
      const userId = currentUser(request).sub;
      const yearMonth = request.body.year_month ?? formatYearMonthUtc();
      const saved = await saveCategoryBudgets(app.db, {
        userId,
        yearMonth,
        categories: request.body.categories.map((item) => ({
          category: item.category,
          monthlyLimit: item.monthly_limit,
        })),
        mode: "replace",
      });
      return buildBudgetResponse(userId, yearMonth, saved.totalBudget, saved.merged);
    },
  );
};
