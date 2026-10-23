import type { ChatMessageRow, ChatSessionRow, TransactionRow, UserRow } from "@cyberbudget/db";
import type {
  ChatMessageItem,
  SessionItem,
  TransactionItemDto,
  UserProfileResponse,
} from "@cyberbudget/shared";
import { toMoneyNumber } from "@cyberbudget/shared";

/**
 * 行对象 → API 响应对象。
 * 旧实现的响应是 FastAPI 直接序列化 ORM 字段，这里集中做列名 camelCase → snake_case 的映射。
 */

export function toUserProfile(row: UserRow): UserProfileResponse {
  return {
    user_id: row.userId,
    username: row.username,
    phone_num: row.phoneNum,
    email: row.email,
    budget: toMoneyNumber(row.monthlyBudget ?? "0"),
    is_active: row.isActive ?? false,
    created_at: row.createdAt?.toISOString() ?? null,
  };
}

export function toTransactionDto(row: TransactionRow): TransactionItemDto {
  return {
    transaction_id: row.transactionId,
    amount: toMoneyNumber(row.amount),
    category: row.category,
    type: row.type ?? null,
    note: row.note,
    transaction_time: row.transactionTime?.toISOString() ?? "",
  };
}

export function toSessionItem(row: ChatSessionRow): SessionItem {
  return {
    session_id: row.sessionId,
    title: row.title,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toChatMessageItem(row: ChatMessageRow): ChatMessageItem {
  return {
    message_id: row.messageId,
    role: row.role,
    content: row.content,
    intent_type: row.intentType,
    graph_path: row.graphPath,
    execution_data: row.executionData ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
