import { createHash } from "node:crypto";

/**
 * 确定性 user_id 生成（方案 5.1）。
 *
 * 旧实现（`backend/api/v1/auth.py`）：
 * ```python
 * USER_NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
 * contact = (phone_num or email or "").strip().lower()
 * unique_uuid = uuid.uuid5(USER_NAMESPACE, contact)
 * return f"usr_{unique_uuid.hex[:16]}"
 * ```
 *
 * ⚠️ 改了这个算法，老账号就登不进去（user_id 是主键，不是自增）。
 * 测试里用旧库真实记录做基准，见 `user-id.test.ts`。
 */

/** RFC 4122 的 DNS 命名空间，与旧代码里的 USER_NAMESPACE 完全一致 */
export const USER_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function namespaceBytes(namespace: string): Buffer {
  const hex = namespace.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`无效的 UUID 命名空间: ${namespace}`);
  }
  return Buffer.from(hex, "hex");
}

/**
 * RFC 4122 §4.3 的 UUIDv5：SHA-1(namespace_bytes || name)，再写入版本位 5、变体位 10xx。
 */
export function uuidv5(namespace: string, name: string): string {
  const hash = createHash("sha1")
    .update(namespaceBytes(namespace))
    .update(Buffer.from(name, "utf8"))
    .digest();

  hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x50, 6); // version 5
  hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8); // variant 10xx

  const hex = hash.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export interface ContactInput {
  readonly phoneNum?: string | null;
  readonly email?: string | null;
}

/**
 * 生成 `usr_` + 16 位十六进制的 user_id。
 *
 * 注意 `unique_uuid.hex[:16]` 等于**前 8 字节**的 hex，不需要先生成带连字符的字符串再截断；
 * 手机号优先于邮箱，取到后 `.strip().lower()`（与旧代码的 `or` 语义一致：
 * 空字符串会继续回退到邮箱）。
 */
export function generateUserId(contact: ContactInput): string {
  const raw = contact.phoneNum || contact.email || "";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "") {
    throw new Error("手机号和邮箱不能同时为空");
  }
  return `usr_${uuidv5(USER_NAMESPACE, normalized).replaceAll("-", "").slice(0, 16)}`;
}
