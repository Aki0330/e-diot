import { updateMonthlyBudget } from "@cyberbudget/db";
import {
  AppError,
  formatCents,
  parseCents,
  setBudgetRequestSchema,
  userProfileResponseSchema,
  type UserProfileResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { toUserProfile } from "../serializers.js";
import { currentUser, requireActiveUser } from "../services/users.js";

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/v1/users/me
  app.get(
    "/users/me",
    { preHandler: app.authenticate, schema: { response: { 200: userProfileResponseSchema } } },
    async (request): Promise<UserProfileResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      return toUserProfile(user);
    },
  );

  // POST /api/v1/users/set_budget
  app.post(
    "/users/set_budget",
    {
      preHandler: app.authenticate,
      schema: { body: setBudgetRequestSchema, response: { 200: userProfileResponseSchema } },
    },
    async (request): Promise<UserProfileResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const updated = await updateMonthlyBudget(
        app.db,
        user.userId,
        formatCents(parseCents(request.body.budget)),
      );
      if (updated === undefined) {
        throw new AppError("AUTH_USER_NOT_FOUND", "用户不存在");
      }
      return toUserProfile(updated);
    },
  );
};
