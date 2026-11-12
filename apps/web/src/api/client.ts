import type {
  ChatResponse,
  ChatSessionDetail,
  DashboardData,
  LlmConfig,
  MemoryBasis,
  MemoryItem,
  MemoryType,
  TokenResponse,
  TransactionDto,
  TransactionsResponse,
  UserProfile,
  UserSettings,
  BudgetResponse,
} from "./types.js";

/**
 * 与旧 `frontend/js/app.js` 的 `api()` 等价：
 * - 同源 `/api/v1`；
 * - token 存 `localStorage.cb_token`；
 * - 错误优先读后端统一错误体的 `detail`。
 */

const TOKEN_KEY = "cb_token";
const REFRESH_KEY = "cb_refresh";
export const UNAUTHORIZED_EVENT = "cb:unauthorized";

let token = localStorage.getItem(TOKEN_KEY) ?? "";
let refreshToken = localStorage.getItem(REFRESH_KEY) ?? "";
let refreshing: Promise<boolean> | null = null;

export function getToken(): string {
  return token;
}

export function setToken(value: string | null): void {
  token = value ?? "";
  if (token === "") {
    refreshToken = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } else {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

/** 登录/注册/刷新成功后同时保存 access + refresh token */
export function setTokens(access: string, refresh: string): void {
  setToken(access);
  refreshToken = refresh;
  localStorage.setItem(REFRESH_KEY, refresh);
}

async function refreshSession(): Promise<boolean> {
  if (refreshToken === "") return false;
  if (refreshing !== null) return refreshing;

  refreshing = (async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!response.ok) return false;
      const data = (await response.json()) as TokenResponse;
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly body?: unknown;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token !== "") headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`/api/v1${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 401 && attempt === 0 && token !== "" && refreshToken !== "") {
      if (await refreshSession()) continue;
    }

    const data = (await response.json().catch(() => ({}))) as {
      detail?: unknown;
      code?: string;
    } & Record<string, unknown>;

    if (!response.ok) {
      if (response.status === 401) {
        setToken(null);
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
      const detail = typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`;
      throw new ApiError(detail, response.status, data.code);
    }

    return data as T;
  }
}

export const api = {
  login: (account: string, password: string) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: { account, password } }),
  register: (body: { username: string; phone_num?: string; email?: string; password: string }) =>
    request<TokenResponse>("/auth/register", { method: "POST", body }),
  me: () => request<UserProfile>("/users/me"),
  setBudget: (budget: number) =>
    request<UserProfile>("/users/set_budget", { method: "POST", body: { budget } }),
  llmConfig: () => request<LlmConfig>("/users/llm-config"),
  saveLlmConfig: (body: { base_url?: string; api_key?: string }) =>
    request<LlmConfig>("/users/llm-config", { method: "PUT", body }),
  settings: () => request<UserSettings>("/users/settings"),
  saveSettings: (
    body: Partial<Omit<UserSettings, "snooze_until">> & { snooze_until?: string | null },
  ) => request<UserSettings>("/users/settings", { method: "PUT", body }),
  memories: () => request<{ memories: MemoryItem[] }>("/memories"),
  createMemory: (body: { type: MemoryType; content: string }) =>
    request<MemoryItem>("/memories", { method: "POST", body }),
  confirmMemory: (id: string) => request<MemoryItem>(`/memories/${id}/confirm`, { method: "POST" }),
  updateMemory: (id: string, body: { type?: MemoryType; content?: string }) =>
    request<MemoryItem>(`/memories/${id}`, { method: "PATCH", body }),
  deleteMemory: (id: string) =>
    request<{ deleted: string }>(`/memories/${id}`, { method: "DELETE" }),
  memoryBasis: (id: string) => request<MemoryBasis>(`/memories/${id}/basis`),
  proactiveFeedback: (messageId: number, value: "helpful" | "inaccurate" | "mute") =>
    request<{ ok: boolean; snooze_until: string | null }>(`/chat/proactive/${messageId}/feedback`, {
      method: "POST",
      body: { value },
    }),
  dashboard: () => request<DashboardData>("/chat/dashboard"),
  transactions: (
    options: {
      category?: string;
      from?: string;
      to?: string;
      minAmount?: string;
      maxAmount?: string;
      limit?: number;
    } = {},
  ) => {
    const params = new URLSearchParams();
    params.set("limit", String(options.limit ?? 50));
    if (options.category !== undefined && options.category !== "")
      params.set("category", options.category);
    if (options.from !== undefined && options.from !== "") params.set("from", options.from);
    if (options.to !== undefined && options.to !== "") params.set("to", options.to);
    if (options.minAmount !== undefined && options.minAmount !== "")
      params.set("min_amount", options.minAmount);
    if (options.maxAmount !== undefined && options.maxAmount !== "")
      params.set("max_amount", options.maxAmount);
    return request<TransactionsResponse>(`/chat/transactions?${params.toString()}`);
  },
  createTransaction: (body: {
    amount: number;
    type: "EXPENSE" | "INCOME";
    category: string;
    note?: string | null;
    transaction_time?: string;
  }) => request<TransactionDto>("/chat/transactions", { method: "POST", body }),
  updateTransaction: (
    id: number,
    body: {
      amount?: number;
      type?: "EXPENSE" | "INCOME";
      category?: string;
      note?: string | null;
      transaction_time?: string;
    },
  ) => request<TransactionDto>(`/chat/transactions/${id}`, { method: "PATCH", body }),
  deleteTransaction: (id: number) =>
    request<{ deleted: number }>(`/chat/transactions/${id}`, { method: "DELETE" }),
  sessions: () =>
    request<{
      sessions: { session_id: string; title: string; created_at: string; updated_at: string }[];
    }>("/chat/sessions"),
  sessionDetail: (sessionId: string) => request<ChatSessionDetail>(`/chat/sessions/${sessionId}`),
  deleteSession: (sessionId: string) =>
    request<{ deleted: string }>(`/chat/sessions/${sessionId}`, { method: "DELETE" }),
  chat: (message: string, sessionId: string | null) =>
    request<ChatResponse>("/chat", { method: "POST", body: { message, session_id: sessionId } }),
  agentBudget: (userInput: string) =>
    request<BudgetResponse>("/budget/agent", { method: "POST", body: { user_input: userInput } }),
  manualBudget: (categories: { category: string; monthly_limit: number }[]) =>
    request<BudgetResponse>("/budget/manual", { method: "POST", body: { categories } }),
};
