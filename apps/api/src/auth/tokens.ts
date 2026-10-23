import { AppError, REFRESH_TOKEN_TYPE, jwtClaimsSchema, type JwtClaims } from "@cyberbudget/shared";
import { SignJWT, jwtVerify } from "jose";

/**
 * JWT 签发与校验（对应旧 `backend/config.py` 的 create_access_token / decode_access_token）。
 *
 * 契约（方案 5.2）：
 * - HS256，密钥来自 `JWT_SECRET_KEY`（配置阶段已 fail fast）；
 * - payload：`sub` / `username` / `phone_num` / `email` / `exp` / `iat`，时间戳为**秒**；
 * - refresh token 额外带 `type: "refresh"`，业务接口收到必须拒绝。
 */

export interface TokenSettings {
  readonly secretKey: string;
  readonly accessTokenExpireMinutes: number;
  readonly refreshTokenExpireDays: number;
}

export interface TokenSubject {
  readonly userId: string;
  readonly username?: string | null;
  readonly phoneNum?: string | null;
  readonly email?: string | null;
}

const encoder = new TextEncoder();

function secretKey(settings: TokenSettings): Uint8Array {
  return encoder.encode(settings.secretKey);
}

async function sign(
  subject: TokenSubject,
  claims: Record<string, unknown>,
  expiresInSeconds: number,
  settings: TokenSettings,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey(settings));
}

export async function signAccessToken(
  subject: TokenSubject,
  settings: TokenSettings,
): Promise<string> {
  return sign(
    subject,
    {
      username: subject.username ?? "",
      phone_num: subject.phoneNum ?? "",
      email: subject.email ?? "",
    },
    settings.accessTokenExpireMinutes * 60,
    settings,
  );
}

export async function signRefreshToken(
  subject: TokenSubject,
  settings: TokenSettings,
): Promise<string> {
  return sign(
    subject,
    { type: REFRESH_TOKEN_TYPE },
    settings.refreshTokenExpireDays * 24 * 60 * 60,
    settings,
  );
}

/** 校验签名与过期时间，返回解析后的 claims；任何失败都抛 401。 */
export async function verifyToken(token: string, settings: TokenSettings): Promise<JwtClaims> {
  let payload: unknown;
  try {
    const result = await jwtVerify(token, secretKey(settings), { algorithms: ["HS256"] });
    payload = result.payload;
  } catch (error) {
    throw new AppError("AUTH_INVALID_TOKEN", "Token 无效或已过期", { cause: error });
  }

  const parsed = jwtClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError("AUTH_INVALID_TOKEN", "Token 中缺少 'sub' 字段", {
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}
