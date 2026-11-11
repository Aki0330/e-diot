import { updateLlmConfig, updateMonthlyBudget } from "@cyberbudget/db";
import {
  AppError,
  formatCents,
  llmConfigResponseSchema,
  parseCents,
  setBudgetRequestSchema,
  updateLlmConfigRequestSchema,
  userProfileResponseSchema,
  type LlmConfigResponse,
  type UserProfileResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { toUserProfile } from "../serializers.js";
import { currentUser, requireActiveUser } from "../services/users.js";

function toLlmConfig(
  user: { readonly llmBaseUrl: string | null; readonly llmApiKey: string | null },
  model: string,
): LlmConfigResponse {
  return {
    base_url: user.llmBaseUrl,
    has_api_key: (user.llmApiKey ?? "").trim() !== "",
    model,
  };
}

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

  // GET /api/v1/users/llm-config —— 只回传 base_url 与「是否已配置 key」
  app.get(
    "/users/llm-config",
    {
      preHandler: app.authenticate,
      schema: { response: { 200: llmConfigResponseSchema } },
    },
    async (request): Promise<LlmConfigResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      return toLlmConfig(user, app.config.llm.model);
    },
  );

  // PUT /api/v1/users/llm-config —— 传空串清除，不传保持原值
  app.put(
    "/users/llm-config",
    {
      preHandler: app.authenticate,
      schema: {
        body: updateLlmConfigRequestSchema,
        response: { 200: llmConfigResponseSchema },
      },
    },
    async (request): Promise<LlmConfigResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const body = request.body;

      const baseUrl =
        body.base_url === undefined
          ? undefined
          : body.base_url === null || body.base_url.trim() === ""
            ? null
            : body.base_url.trim();
      const apiKey =
        body.api_key === undefined
          ? undefined
          : body.api_key === null || body.api_key.trim() === ""
            ? null
            : body.api_key.trim();

      const updated = await updateLlmConfig(app.db, user.userId, {
        ...(baseUrl === undefined ? {} : { baseUrl }),
        ...(apiKey === undefined ? {} : { apiKey }),
      });
      if (updated === undefined) {
        throw new AppError("AUTH_USER_NOT_FOUND", "用户不存在");
      }
      return toLlmConfig(updated, app.config.llm.model);
    },
  );
};
