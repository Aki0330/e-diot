import { createOpenAiCompatibleClient, runAgent, runAgentWithTrace } from "@cyberbudget/agent";
import type { Database } from "@cyberbudget/db";
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

/** P3 真实实现：6 节点流水线 + OpenAI 兼容 LLM。 */
export function createAgentRunner({ db, config }: AgentRunnerOptions): AgentRunner {
  const llm = createOpenAiCompatibleClient({
    apiKey: config.llm.apiKey,
    baseUrl: config.llm.baseUrl,
    model: config.llm.model,
  });

  return {
    run: async (userId, message) => runAgent({ db, llm }, userId, message),
    runWithTrace: async (userId, message) => {
      const trace = await runAgentWithTrace({ db, llm }, userId, message);
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
