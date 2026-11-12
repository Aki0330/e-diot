import {
  getUserSettings,
  updateLlmConfig,
  updateMonthlyBudget,
  upsertUserSettings,
  type UserSettingsRow,
} from "@cyberbudget/db";
import {
  AppError,
  DEFAULT_CARE_TIME,
  DEFAULT_PERSONA,
  DEFAULT_PROACTIVE_LEVEL,
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  PERSONAS,
  PROACTIVE_LEVELS,
  formatCents,
  llmConfigResponseSchema,
  parseCents,
  setBudgetRequestSchema,
  updateLlmConfigRequestSchema,
  updateUserSettingsRequestSchema,
  userProfileResponseSchema,
  userSettingsResponseSchema,
  type LlmConfigResponse,
  type UserProfileResponse,
  type UserSettingsResponse,
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

function toSettings(row: UserSettingsRow | undefined): UserSettingsResponse {
  return {
    persona: PERSONAS.find((item) => item === row?.persona) ?? DEFAULT_PERSONA,
    proactive_level:
      PROACTIVE_LEVELS.find((item) => item === row?.proactiveLevel) ?? DEFAULT_PROACTIVE_LEVEL,
    care_time: row?.careTime ?? DEFAULT_CARE_TIME,
    quiet_start: row?.quietStart ?? DEFAULT_QUIET_START,
    quiet_end: row?.quietEnd ?? DEFAULT_QUIET_END,
    snooze_until: row?.snoozeUntil?.toISOString() ?? null,
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

  // GET /api/v1/users/settings —— 人格 / 主动程度 / 关怀时间 / 免打扰
  app.get(
    "/users/settings",
    {
      preHandler: app.authenticate,
      schema: { response: { 200: userSettingsResponseSchema } },
    },
    async (request): Promise<UserSettingsResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      return toSettings(await getUserSettings(app.db, user.userId));
    },
  );

  // PUT /api/v1/users/settings —— 只更新传入字段
  app.put(
    "/users/settings",
    {
      preHandler: app.authenticate,
      schema: {
        body: updateUserSettingsRequestSchema,
        response: { 200: userSettingsResponseSchema },
      },
    },
    async (request): Promise<UserSettingsResponse> => {
      const user = await requireActiveUser(app.db, currentUser(request));
      const body = request.body;

      const patch = {
        ...(body.persona === undefined ? {} : { persona: body.persona }),
        ...(body.proactive_level === undefined ? {} : { proactiveLevel: body.proactive_level }),
        ...(body.care_time === undefined ? {} : { careTime: body.care_time }),
        ...(body.quiet_start === undefined ? {} : { quietStart: body.quiet_start }),
        ...(body.quiet_end === undefined ? {} : { quietEnd: body.quiet_end }),
        ...(body.snooze_until === undefined
          ? {}
          : {
              snoozeUntil: body.snooze_until === null ? null : new Date(body.snooze_until),
            }),
      };

      const updated = await upsertUserSettings(app.db, user.userId, patch);
      return toSettings(updated);
    },
  );
};
