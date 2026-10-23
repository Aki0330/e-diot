import { findUserById, type Database, type UserRow } from "@cyberbudget/db";
import { AppError, type JwtClaims } from "@cyberbudget/shared";
import type { FastifyRequest } from "fastify";

/**
 * 从 `request.user` 取 claims，并加载用户行。
 *
 * 行为修正（方案 6.5）：旧实现里 `users.py` / `budget.py` 检查 `is_active`，
 * 而 `chat.py` 的 `_get_user` 没检查；这里统一检查。
 */
export function currentUser(request: FastifyRequest): JwtClaims {
  if (request.user === null) {
    throw new AppError("AUTH_INVALID_TOKEN", "未提供认证 token");
  }
  return request.user;
}

export async function requireActiveUser(db: Database, claims: JwtClaims): Promise<UserRow> {
  const user = await findUserById(db, claims.sub);
  if (user === undefined) {
    throw new AppError("AUTH_USER_NOT_FOUND", "用户不存在");
  }
  if (user.isActive === false) {
    throw new AppError("AUTH_USER_DISABLED", "账户已被禁用");
  }
  return user;
}
