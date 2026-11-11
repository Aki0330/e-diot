import {
  createOpenAiCompatibleClient,
  runAgent,
  runAgentWithTrace,
  type LlmClient,
} from "@cyberbudget/agent";
import { findUserById, type Database } from "@cyberbudget/db";
import type { AppConfig } from "@cyberbudget/shared";
import type { FastifyInstance } from "fastify";

/**
 * Agent 端口：路由只依赖这个接口，实现可以是 P3 的真实流水线，也可以是测试里的占位实现。
 * 返回值形状对齐旧 `run_agent_with_trace` 的 trace。
 */

export interface AgentTrace {
  readonly response: string;
  readonly intentType: string | null;
  readonly graphPath: string;
  readonly executionData: Record<string, unknown> | null;
}

export interface AgentRunner {
  /** 只取回复文本（对应旧 `run_agent`），预算 Agent 端点用 */
  run(userId: string, message: string): Promise<string>;
  /** 带执行追踪（对应旧 `run_agent_with_trace`），对话端点用 */
  runWithTrace(userId: string, message: string): Promise<AgentTrace>;
}

export const PLACEHOLDER_GRAPH_PATH = "parse_intent→generate_response";

/** 占位实现：测试与本地无 LLM key 时使用，只回显、不写库。 */
export function createPlaceholderAgent(): AgentRunner {
  const runWithTrace = (_userId: string, message: string): Promise<AgentTrace> =>
    Promise.resolve({
      response: `已收到：「${message.slice(0, 200)}」。记账 Agent 将在 P3 接入，当前为接口占位回复。`,
      intentType: "chat",
      graphPath: PLACEHOLDER_GRAPH_PATH,
      executionData: null,
    });

  return {
    run: async (userId, message) => (await runWithTrace(userId, message)).response,
    runWithTrace,
  };
}

export interface AgentRunnerOptions {
  readonly db: Database;
  readonly config: AppConfig;
}

export interface LlmSettings {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export interface UserLlmOverride {
  readonly llmBaseUrl: string | null;
  readonly llmApiKey: string | null;
}

/**
 * 选择 LLM 配置：用户级 base_url 和 key **都非空**时优先使用，否则回落到全局
 * `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`。纯函数，便于单测。
 */
export function pickLlmSettings(config: AppConfig, user: UserLlmOverride | null): LlmSettings {
  const baseUrl = (user?.llmBaseUrl ?? "").trim();
  const apiKey = (user?.llmApiKey ?? "").trim();
  if (baseUrl !== "" && apiKey !== "") {
    return { baseUrl, apiKey, model: config.llm.model };
  }
  return { baseUrl: config.llm.baseUrl, apiKey: config.llm.apiKey, model: config.llm.model };
}

/** P3 真实实现：6 节点流水线 + OpenAI 兼容 LLM（按用户配置动态选择）。 */
export function createAgentRunner({ db, config }: AgentRunnerOptions): AgentRunner {
  const llmForUser = async (userId: string): Promise<LlmClient> => {
    const user = await findUserById(db, userId);
    return createOpenAiCompatibleClient(pickLlmSettings(config, user ?? null));
  };

  return {
    run: async (userId, message) =>
      runAgent({ db, llm: await llmForUser(userId) }, userId, message),
    runWithTrace: async (userId, message) => {
      const trace = await runAgentWithTrace({ db, llm: await llmForUser(userId) }, userId, message);
      return {
        response: trace.response,
        intentType: trace.intentType,
        graphPath: trace.graphPath,
        executionData: trace.executionData,
      };
    },
  };
}

export function registerAgent(app: FastifyInstance, config: AppConfig, agent?: AgentRunner): void {
  app.decorate("agent", agent ?? createAgentRunner({ db: app.db, config }));
}
