import type {
  ChatResponse,
  ChatSessionDetail,
  DashboardData,
  LlmConfig,
  MemoryBasis,
  MemoryItem,
  MemoryType,
  TokenResponse,
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
export const UNAUTHORIZED_EVENT = "cb:unauthorized";

let token = localStorage.getItem(TOKEN_KEY) ?? "";

export function getToken(): string {
  return token;
}

export function setToken(value: string | null): void {
  token = value ?? "";
  if (token === "") localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
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
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== "") headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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
  transactions: (category: string) =>
    request<TransactionsResponse>(
      `/chat/transactions?limit=50${category === "" ? "" : `&category=${encodeURIComponent(category)}`}`,
    ),
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
