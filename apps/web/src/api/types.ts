export interface UserProfile {
  readonly user_id: string;
  readonly username: string;
  readonly phone_num: string | null;
  readonly email: string | null;
  readonly budget: number;
  readonly is_active: boolean;
  readonly created_at: string | null;
  readonly llm_base_url?: string | null;
  readonly has_llm_key?: boolean;
}

/** 用户级 LLM 配置（接口不会回传密钥明文） */
export interface LlmConfig {
  readonly base_url: string | null;
  readonly has_api_key: boolean;
  readonly model: string;
}

export type PersonaId = "lurker" | "introvert" | "buddy" | "chatterbox";
export type ProactiveLevel = "low" | "medium" | "high";

export type MemoryType = "preference" | "goal" | "habit" | "boundary";
export type MemoryStatus = "pending" | "active" | "deleted";

export interface MemoryItem {
  readonly id: string;
  readonly type: MemoryType;
  readonly content: string;
  readonly source: "conversation" | "transaction" | "manual";
  readonly source_ref: string | null;
  readonly status: MemoryStatus;
  readonly confidence: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly deleted_at: string | null;
}

export interface MemoryBasis {
  readonly memory_id: string;
  readonly source: "conversation" | "transaction" | "manual";
  readonly source_ref: string | null;
  readonly transaction: TransactionDto | null;
  readonly message: {
    readonly message_id: number;
    readonly role: string;
    readonly content: string;
    readonly created_at: string;
  } | null;
  readonly note: string | null;
}

/** 相处方式：人格、主动程度、关怀时间与免打扰 */
export interface UserSettings {
  readonly persona: PersonaId;
  readonly proactive_level: ProactiveLevel;
  readonly care_time: string;
  readonly quiet_start: string;
  readonly quiet_end: string;
  readonly snooze_until: string | null;
}

export interface TokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly token_type: string;
}

export interface TransactionDto {
  readonly transaction_id: number;
  readonly amount: number;
  readonly category: string;
  readonly type: string | null;
  readonly note: string | null;
  readonly transaction_time: string;
}

export interface DashboardCategory {
  readonly category: string;
  readonly spent: number;
  readonly budget: number;
  readonly percentage: number;
}

export interface DashboardData {
  readonly user_id: string;
  readonly year_month: string;
  readonly total_budget: number;
  readonly total_spent: number;
  readonly total_income: number;
  readonly remaining: number;
  readonly categories: readonly DashboardCategory[];
  readonly recent_transactions: readonly TransactionDto[];
}

export interface SessionItem {
  readonly session_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ChatMessageItem {
  readonly message_id: number;
  readonly role: string;
  readonly content: string;
  readonly intent_type: string | null;
  readonly graph_path: string | null;
  readonly created_at: string;
}

export interface ChatSessionDetail {
  readonly session_id: string;
  readonly user_id: string;
  readonly title: string;
  readonly messages: readonly ChatMessageItem[];
}

export interface ChatResponse {
  readonly session_id: string;
  readonly user_id: string;
  readonly message: string;
  readonly response: string;
  readonly intent_type: string | null;
  readonly graph_path: string | null;
}

export interface BudgetResponse {
  readonly user_id: string;
  readonly year_month: string;
  readonly total_budget: number;
  readonly categories: readonly { category: string; monthly_limit: number }[];
  readonly total_allocated: number;
  readonly remaining_unallocated: number;
  readonly is_valid: boolean;
}

export interface TransactionsResponse {
  readonly user_id: string;
  readonly total: number;
  readonly transactions: readonly TransactionDto[];
}
