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
 * - 登录态保存在 localStorage；
 * - 错误优先读后端统一错误体的 `detail`。
 */

const TOKEN_KEY = "cb_token";
const REFRESH_KEY = "cb_refresh";
const SESSION_KEY = "cb_session";
const CREDENTIAL_PREFIX = "cb_auth:";
const LEGACY_SESSION = "legacy";
const SESSION_EVENT = "cb:session-change";
export const UNAUTHORIZED_EVENT = "cb:unauthorized";

interface Session {
  id: string;
  access: string;
  refresh: string;
}

function tokenKey(id: string): string {
  return `${CREDENTIAL_PREFIX}${id}:tokens`;
}

function loginKey(id: string): string {
  return id === LEGACY_SESSION ? TOKEN_KEY : `${CREDENTIAL_PREFIX}${id}:login`;
}

function storedSession(): Session | null {
  const id = localStorage.getItem(SESSION_KEY) ?? LEGACY_SESSION;
  // 此标记只有登录会创建。退出时删除它，迟到的刷新即使写入自己的旧槽位也无法恢复登录。
  const login = localStorage.getItem(loginKey(id));
  if (!login) return null;
  const pair = localStorage.getItem(tokenKey(id));
  if (pair !== null) {
    try {
      const data = JSON.parse(pair) as Partial<Session> | null;
      if (typeof data?.access === "string" && data.access && typeof data.refresh === "string") {
        return { id, access: data.access, refresh: data.refresh };
      }
    } catch {
      // 存储数据损坏时重新登录，避免阻断整个页面的加载。
    }
    return null;
  }
  // 旧版会话继续使用原有凭据，轮换后的令牌也按会话存储。
  return id === LEGACY_SESSION
    ? { id, access: login, refresh: localStorage.getItem(REFRESH_KEY) ?? "" }
    : null;
}

export function getToken(): string {
  return storedSession()?.access ?? "";
}

function discardCredentials(id: string): void {
  localStorage.removeItem(loginKey(id));
  localStorage.removeItem(tokenKey(id));
  if (id === LEGACY_SESSION) localStorage.removeItem(REFRESH_KEY);
}

function pruneCredentials(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CREDENTIAL_PREFIX)) continue;
    const id = key.slice(CREDENTIAL_PREFIX.length, key.lastIndexOf(":"));
    if (
      id !== (localStorage.getItem(SESSION_KEY) ?? LEGACY_SESSION) ||
      !localStorage.getItem(loginKey(id))
    ) {
      localStorage.removeItem(key);
    }
  }
  if (localStorage.getItem(SESSION_KEY) !== null) discardCredentials(LEGACY_SESSION);
}

pruneCredentials();
let tabSession = storedSession()?.id ?? null;

export function currentSession(): string | null {
  return tabSession;
}

function syncSession(): void {
  const session = storedSession()?.id ?? null;
  if (session === tabSession) return;
  tabSession = session;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function subscribeSession(listener: () => void): () => void {
  window.addEventListener(SESSION_EVENT, listener);
  window.addEventListener("storage", syncSession);
  syncSession();
  return () => {
    window.removeEventListener(SESSION_EVENT, listener);
    window.removeEventListener("storage", syncSession);
  };
}

/** 登录/注册开始新会话；普通刷新仅轮换当前会话的令牌。 */
export function setTokens(access: string, refresh: string): void {
  const id = crypto.getRandomValues(new Uint32Array(4)).join("-");
  localStorage.setItem(SESSION_KEY, id);
  localStorage.setItem(loginKey(id), "1");
  localStorage.setItem(tokenKey(id), JSON.stringify({ access, refresh }));
  pruneCredentials();
  syncSession();
}

export function setToken(value: string | null): void {
  if (value) {
    setTokens(value, "");
    return;
  }
  if (tabSession !== null) logoutSession(tabSession);
}

export function logoutSession(id: string): void {
  discardCredentials(id);
  syncSession();
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

function ownedSession(id: string | null): Session | null {
  const current = storedSession();
  if (id !== (current?.id ?? null)) throw new ApiError("登录状态已变更", 401);
  return current;
}

async function responseError(response: Response): Promise<ApiError> {
  const data = (await response.json().catch(() => null)) as {
    detail?: unknown;
    code?: string;
  } | null;
  const detail = typeof data?.detail === "string" ? data.detail : `HTTP ${response.status}`;
  return new ApiError(detail, response.status, data?.code);
}

function expireSession(id: string): void {
  logoutSession(id);
  if (tabSession === null) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

let refreshing: { session: string; promise: Promise<void> } | null = null;

async function renew(session: Session): Promise<void> {
  const response = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh }),
  });

  if (!response.ok) {
    const error = await responseError(response);
    if (ownedSession(session.id)?.access !== session.access) return;
    if (response.status === 401) expireSession(session.id);
    throw error;
  }
  const data = (await response.json()) as Partial<TokenResponse> | null;
  if (ownedSession(session.id)?.access !== session.access) return;
  if (
    typeof data?.access_token !== "string" ||
    !data.access_token ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token
  )
    throw new Error("刷新响应缺少令牌");
  localStorage.setItem(
    tokenKey(session.id),
    JSON.stringify({ access: data.access_token, refresh: data.refresh_token }),
  );
  if (storedSession()?.id !== session.id) discardCredentials(session.id);
}

function refreshSession(session: Session): Promise<void> {
  if (refreshing?.session === session.id) return refreshing.promise;
  const promise = renew(session).finally(() => {
    if (refreshing?.promise === promise) refreshing = null;
  });
  refreshing = { session: session.id, promise };
  return promise;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const session = currentSession();
  const authenticated = session !== null && !path.startsWith("/auth/");
  for (let attempt = 0; ; attempt += 1) {
    const credentials = ownedSession(session);
    const access = authenticated ? (credentials?.access ?? "") : "";
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (access !== "") headers["Authorization"] = `Bearer ${access}`;

    const response = await fetch(`/api/v1${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.ok) {
      const data = (await response.json().catch(() => ({}))) as T;
      ownedSession(session);
      return data;
    }
    const error = await responseError(response);
    const latest = ownedSession(session);
    if (response.status === 401 && authenticated && latest !== null) {
      if (attempt === 0) {
        if (access !== latest.access) continue;
        if (latest.refresh) {
          await refreshSession(latest);
          continue;
        }
      }
      if (access === latest.access) expireSession(latest.id);
    }
    throw error;
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
