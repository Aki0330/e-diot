import { AppError, REFRESH_TOKEN_TYPE } from "@cyberbudget/shared";
import type { AppConfig } from "@cyberbudget/shared";
import type { FastifyInstance } from "fastify";

import { verifyToken, type TokenSettings } from "../auth/tokens.js";

/**
 * 鉴权：`Authorization: Bearer <access_token>`。
 *
 * 行为对齐旧 `get_current_user`（方案 5.2）：
 * - 兼容裸 token；
 * - 缺少 / 过期 / 签名错误 → 401；
 * - `type === "refresh"` 的 token 访问业务接口 → 401。
 */
export function tokenSettings(config: AppConfig): TokenSettings {
  return {
    secretKey: config.jwt.secretKey,
    accessTokenExpireMinutes: config.jwt.accessTokenExpireMinutes,
    refreshTokenExpireDays: config.jwt.refreshTokenExpireDays,
  };
}

export function registerAuth(app: FastifyInstance, config: AppConfig): void {
  const settings = tokenSettings(config);

  app.decorateRequest("user", null);

  app.decorate("authenticate", async (request) => {
    const header = request.headers.authorization;
    if (header === undefined || header.trim() === "") {
      throw new AppError("AUTH_INVALID_TOKEN", "未提供认证 token");
    }

    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
    const claims = await verifyToken(token.trim(), settings);

    if (claims.type === REFRESH_TOKEN_TYPE) {
      throw new AppError(
        "AUTH_REFRESH_TOKEN_NOT_ALLOWED",
        "Refresh token 不能用于访问业务接口，请使用 access_token",
      );
    }

    request.user = claims;
  });
}
