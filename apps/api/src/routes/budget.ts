import { listMonthBudgets, replaceMonthBudgets, type UserRow } from "@cyberbudget/db";
import {
  AppError,
  agentBudgetRequestSchema,
  budgetResponseSchema,
  centsToNumber,
  formatCents,
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

function requireTotalBudget(user: UserRow): string {
  const totalBudget = user.monthlyBudget ?? "0";
  if (parseCents(totalBudget) <= 0n) {
    throw new AppError(
      "BUDGET_TOTAL_NOT_SET",
      "尚未设置月度总预算，请先在 /users/set_budget 中设定",
    );
  }
  return totalBudget;
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

      // P2 阶段是占位 Agent；P3 换成真实流水线后，这里会自动按 MERGE 语义写库
      await app.agent.run(user.userId, request.body.user_input);

      const yearMonth = formatYearMonthUtc();
      const rows = await listMonthBudgets(app.db, user.userId, yearMonth);
      return buildBudgetResponse(user.userId, yearMonth, user.monthlyBudget ?? "0", rows);
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
      const user = await requireActiveUser(app.db, currentUser(request));
      const totalBudget = requireTotalBudget(user);

      const rows: CategoryLimit[] = request.body.categories.map((item) => ({
        category: item.category,
        monthlyLimit: formatCents(parseCents(item.monthly_limit)),
      }));

      const allocated = rows.reduce((sum, row) => sum + parseCents(row.monthlyLimit), 0n);
      const total = parseCents(totalBudget);
      if (allocated > total) {
        throw new AppError(
          "BUDGET_OVER_ALLOCATED",
          `子类预算合计 ${formatCents(allocated)} 超出总预算 ${formatCents(total)}，请调整后重试`,
        );
      }

      const yearMonth = request.body.year_month ?? formatYearMonthUtc();

      // 全量替换必须在事务里：删除成功但插入失败会把当月预算清空
      await app.db.transaction(async (tx) => {
        await replaceMonthBudgets(tx, user.userId, yearMonth, rows);
      });

      return buildBudgetResponse(user.userId, yearMonth, totalBudget, rows);
    },
  );
};
