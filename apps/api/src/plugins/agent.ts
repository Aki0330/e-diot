import {
  createOpenAiCompatibleClient,
  runAgent,
  runAgentWithTrace,
  type ChatTurn,
  type KnowledgePort,
  type KnowledgeSnippet,
  type LlmClient,
  type MemoryContext,
} from "@cyberbudget/agent";
import { findUserById, type Database } from "@cyberbudget/db";
import { createKnowledgeRuntime, searchKnowledge } from "@cyberbudget/knowledge";
import type { AppConfig, KnowledgeCitation, Persona } from "@cyberbudget/shared";
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
  /** 本轮回答引用的知识库片段（P4b） */
  readonly citations?: readonly KnowledgeCitation[];
}

export interface AgentRunOptions {
  /** 同一会话的最近历史（Agent 内部会再做截断） */
  readonly history?: readonly ChatTurn[];
  /** 用户相处人格 */
  readonly persona?: Persona;
  /** 用户已确认的长期记忆 */
  readonly memories?: readonly MemoryContext[];
}

export interface AgentRunner {
  /** 只取回复文本（对应旧 `run_agent`），预算 Agent 端点用 */
  run(userId: string, message: string, options?: AgentRunOptions): Promise<string>;
  /** 带执行追踪（对应旧 `run_agent_with_trace`），对话端点用 */
  runWithTrace(userId: string, message: string, options?: AgentRunOptions): Promise<AgentTrace>;
}

export const PLACEHOLDER_GRAPH_PATH = "parse_intent→generate_response";

/** 占位实现：测试与本地无 LLM key 时使用，只回显、不写库。 */
export function createPlaceholderAgent(): AgentRunner {
  const runWithTrace = (
    _userId: string,
    message: string,
    _options?: AgentRunOptions,
  ): Promise<AgentTrace> =>
    Promise.resolve({
      response: `已收到：「${message.slice(0, 200)}」。记账 Agent 将在 P3 接入，当前为接口占位回复。`,
      intentType: "chat",
      graphPath: PLACEHOLDER_GRAPH_PATH,
      executionData: null,
    });

  return {
    run: async (userId, message, options) =>
      (await runWithTrace(userId, message, options)).response,
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

function tagsOf(metadata: Record<string, unknown> | undefined): readonly string[] {
  const tags = metadata?.["tags"];
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

/**
 * 知识库端口（P4b）：惰性创建运行时，首次检索才连接 Milvus 与推理 sidecar。
 * 检索失败由 Agent 内部兜底为空片段，这里不吞错——保留给 Agent 的 best-effort 逻辑统一处理。
 */
export function createAgentKnowledgePort(): KnowledgePort {
  if (process.env["KNOWLEDGE_ENABLED"]?.trim().toLowerCase() === "false") {
    // 本地没有 Milvus / 推理 sidecar 时显式关闭，chat 仍可正常记账。
    return { search: () => Promise.resolve([]) };
  }
  let runtime: ReturnType<typeof createKnowledgeRuntime> | undefined;

  return {
    async search(query, options): Promise<readonly KnowledgeSnippet[]> {
      try {
        runtime ??= createKnowledgeRuntime();
        const hits = await searchKnowledge(runtime, {
          query,
          topK: options?.topK ?? 3,
          ...(options?.categoryFilter === undefined
            ? {}
            : { categoryFilter: options.categoryFilter }),
          ...(options?.candidatePool === undefined ? {} : { candidatePool: options.candidatePool }),
        });
        return hits.map((hit) => ({
          content: hit.content,
          category: hit.category,
          score: hit.rerankScore,
          tags: tagsOf(hit.metadata),
        }));
      } catch {
        // 知识库是增强项：Milvus / 推理 sidecar 没起来时降级为无引用，不阻塞记账对话。
        return [];
      }
    },
  };
}

/** P3 真实实现：6 节点流水线 + OpenAI 兼容 LLM（按用户配置动态选择）。 */
export function createAgentRunner({ db, config }: AgentRunnerOptions): AgentRunner {
  const knowledge = createAgentKnowledgePort();
  const llmForUser = async (userId: string): Promise<LlmClient> => {
    const user = await findUserById(db, userId);
    return createOpenAiCompatibleClient(pickLlmSettings(config, user ?? null));
  };

  return {
    run: async (userId, message, options) =>
      runAgent({ db, llm: await llmForUser(userId) }, userId, message, {
        ...options,
        knowledge,
      }),
    runWithTrace: async (userId, message, options) => {
      const trace = await runAgentWithTrace(
        { db, llm: await llmForUser(userId) },
        userId,
        message,
        { ...options, knowledge },
      );
      return {
        response: trace.response,
        intentType: trace.intentType,
        graphPath: trace.graphPath,
        executionData: trace.executionData,
        citations: trace.citations.map((snippet) => ({
          content: snippet.content,
          category: snippet.category,
          score: Math.round(snippet.score * 10_000) / 10_000,
          tags: [...snippet.tags],
        })),
      };
    },
  };
}

export function registerAgent(app: FastifyInstance, config: AppConfig, agent?: AgentRunner): void {
  app.decorate("agent", agent ?? createAgentRunner({ db: app.db, config }));
}
