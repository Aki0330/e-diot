import { hash, verify } from "@node-rs/bcrypt";
import {
  findContactConflicts,
  findUserByLoginAccount,
  insertUser,
  markLogin,
} from "@cyberbudget/db";
import {
  AppError,
  generateUserId,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  tokenResponseSchema,
  type TokenResponse,
} from "@cyberbudget/shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import { signAccessToken, signRefreshToken, verifyToken } from "../auth/tokens.js";
import { tokenSettings } from "../plugins/auth.js";

/** 与旧 passlib bcrypt 默认 cost 一致（`$2b$12$...`） */
const BCRYPT_ROUNDS = 12;

async function issueTokens(
  subject: {
    userId: string;
    username?: string | null;
    phoneNum?: string | null;
    email?: string | null;
  },
  settings: ReturnType<typeof tokenSettings>,
): Promise<TokenResponse> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(subject, settings),
    signRefreshToken(subject, settings),
  ]);
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "bearer" };
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const settings = tokenSettings(app.config);

  // POST /api/v1/auth/register
  app.post(
    "/auth/register",
    {
      schema: {
        body: registerRequestSchema,
        response: { 201: tokenResponseSchema },
      },
    },
    async (request, reply): Promise<TokenResponse> => {
      const body = request.body;

      const conflicts = await findContactConflicts(app.db, {
        username: body.username,
        phoneNum: body.phone_num,
        email: body.email,
      });

      const messages: string[] = [];
      if (conflicts.phoneNum) messages.push("手机号已被注册");
      if (conflicts.email) messages.push("邮箱已被注册");
      if (conflicts.username) messages.push("用户名已被占用");
      if (messages.length > 0) {
        throw new AppError("CONFLICT", messages.join("；"));
      }

      const user = await insertUser(app.db, {
        userId: generateUserId({ phoneNum: body.phone_num, email: body.email }),
        username: body.username,
        phoneNum: body.phone_num ?? null,
        email: body.email ?? null,
        passwordHash: await hash(body.password, { cost: BCRYPT_ROUNDS }),
      });

      return reply.status(201).send(
        await issueTokens(
          {
            userId: user.userId,
            username: user.username,
            phoneNum: user.phoneNum,
            email: user.email,
          },
          settings,
        ),
      );
    },
  );

  // POST /api/v1/auth/login
  app.post(
    "/auth/login",
    { schema: { body: loginRequestSchema, response: { 200: tokenResponseSchema } } },
    async (request): Promise<TokenResponse> => {
      const account = request.body.account.trim();
      const user = await findUserByLoginAccount(app.db, account);

      if (user === undefined || !(await verify(request.body.password, user.passwordHash))) {
        throw new AppError("AUTH_INVALID_CREDENTIALS", "账号或密码错误");
      }
      if (user.isActive === false) {
        throw new AppError("AUTH_USER_DISABLED", "账户已被禁用");
      }

      await markLogin(app.db, user.userId);

      return issueTokens(
        {
          userId: user.userId,
          username: user.username,
          phoneNum: user.phoneNum,
          email: user.email,
        },
        settings,
      );
    },
  );

  // POST /api/v1/auth/refresh
  app.post(
    "/auth/refresh",
    { schema: { body: refreshRequestSchema, response: { 200: tokenResponseSchema } } },
    async (request): Promise<TokenResponse> => {
      let claims;
      try {
        claims = await verifyToken(request.body.refresh_token, settings);
      } catch {
        throw new AppError("AUTH_INVALID_TOKEN", "Refresh token 无效或已过期");
      }

      if (claims.type !== "refresh") {
        throw new AppError(
          "AUTH_REFRESH_TOKEN_NOT_ALLOWED",
          "请使用 refresh_token 而非 access_token",
        );
      }

      const [accessToken, refreshToken] = await Promise.all([
        signAccessToken({ userId: claims.sub, username: claims.username }, settings),
        signRefreshToken({ userId: claims.sub }, settings),
      ]);

      return { access_token: accessToken, refresh_token: refreshToken, token_type: "bearer" };
    },
  );
};
