import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  findUserById,
  listMonthBudgets,
  mergeAndValidateBudgets,
  updateMonthlyBudget,
  upsertMonthBudgets,
  type Database,
} from "@cyberbudget/db";
import { formatCents, formatYearMonthUtc, parseCents } from "@cyberbudget/shared";

import { performWebSearch, type WebSearchOptions } from "./tavily.js";

/**
 * MCP Server 组装（对应旧 `backend/mcp/server.py`）。
 *
 * P4a 范围：BMI、长任务（进度通知）、Tavily 联网搜索、两个资源、一个 prompt。
 * `knowledge_search`（Milvus + BGE-M3 + Reranker）留到 P4b，先返回明确的占位提示，
 * 工具签名与旧实现保持一致，客户端不需要改。
 */

export const MCP_SERVER_NAME = "My Advanced MCP Server";
export const MCP_SERVER_VERSION = "1.0.0";

export interface McpServerDeps extends WebSearchOptions {
  /** 长任务每步等待时间，测试可注入 0 */
  readonly sleep?: (ms: number) => Promise<void>;
  /** 预算工具使用的数据库连接（未配置时工具返回提示） */
  readonly db?: Database;
  /** 未在工具参数中传 user_id 时使用的默认用户 */
  readonly defaultUserId?: string;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function text(value: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: value }] };
}

function moneyText(value: string | null): string {
  return Number(value ?? "0").toFixed(2);
}

function monthOf(): string {
  return formatYearMonthUtc(new Date());
}

function resolveUserId(deps: McpServerDeps, explicit?: string): string | null {
  const userId = (explicit ?? "").trim() || (deps.defaultUserId ?? "").trim();
  return userId === "" ? null : userId;
}

async function budgetSummary(db: Database, userId: string): Promise<string> {
  const user = await findUserById(db, userId);
  if (user === undefined) return `❌ 用户不存在：${userId}`;
  const month = monthOf();
  const budgets = await listMonthBudgets(db, userId, month);
  const lines = [
    `💰 预算概览（${month}）`,
    `用户：${user.username}（${userId}）`,
    `总预算：¥${moneyText(user.monthlyBudget)}`,
  ];
  if (budgets.length === 0) {
    lines.push("分类预算：暂无");
  } else {
    lines.push("分类预算：");
    let total = 0;
    for (const budget of budgets) {
      total += Number(budget.monthlyLimit);
      lines.push(`- ${budget.category}：¥${moneyText(budget.monthlyLimit)}`);
    }
    lines.push(`分类合计：¥${total.toFixed(2)}`);
  }
  return lines.join("\n");
}

export function createMcpServer(deps: McpServerDeps): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    // 长任务要用 notifications/message 汇报进度，需要声明 logging 能力
    { capabilities: { logging: {} } },
  );
  const sleep = deps.sleep ?? defaultSleep;

  // ── Tool: BMI ──
  server.registerTool(
    "calculate_bmi",
    {
      title: "BMI 计算器",
      description: "计算人体体质指数 (BMI)。weight_kg: 体重（千克），height_m: 身高（米）",
      inputSchema: { weight_kg: z.number(), height_m: z.number() },
    },
    ({ weight_kg, height_m }) => {
      if (height_m <= 0) {
        return text("错误：身高必须大于 0");
      }
      const bmi = weight_kg / height_m ** 2;
      const category = bmi < 18.5 ? "偏瘦" : bmi < 24 ? "正常" : "偏胖";
      return text(`BMI 指数为: ${bmi.toFixed(2)}，属于【${category}】区间。`);
    },
  );

  // ── Tool: 预算 ──
  server.registerTool(
    "get_budget",
    {
      title: "查询预算",
      description:
        "查询用户的月总预算与分类预算。user_id 可省略（使用 MCP_DEFAULT_USER_ID 配置的默认用户）。",
      inputSchema: { user_id: z.string().optional() },
    },
    async ({ user_id }) => {
      if (deps.db === undefined) return text("❌ MCP 未配置数据库连接，无法查询预算");
      const userId = resolveUserId(deps, user_id);
      if (userId === null) return text("❌ 请提供 user_id，或设置环境变量 MCP_DEFAULT_USER_ID");
      return text(await budgetSummary(deps.db, userId));
    },
  );

  server.registerTool(
    "set_budget",
    {
      title: "设置预算",
      description:
        "设置月总预算，并按分类 MERGE 预算额度（不会删除未提及的分类）。" +
        "user_id 可省略（使用 MCP_DEFAULT_USER_ID）；至少提供 total_budget 或 categories 之一。",
      inputSchema: {
        user_id: z.string().optional(),
        total_budget: z.number().positive().optional(),
        categories: z
          .array(
            z.object({
              category: z.string().min(1),
              monthly_limit: z.number().positive(),
            }),
          )
          .optional(),
      },
    },
    async ({ user_id, total_budget, categories }) => {
      if (deps.db === undefined) return text("❌ MCP 未配置数据库连接，无法设置预算");
      const userId = resolveUserId(deps, user_id);
      if (userId === null) return text("❌ 请提供 user_id，或设置环境变量 MCP_DEFAULT_USER_ID");

      const user = await findUserById(deps.db, userId);
      if (user === undefined) return text(`❌ 用户不存在：${userId}`);

      const hasCategories = categories !== undefined && categories.length > 0;
      if (total_budget === undefined && !hasCategories) {
        return text("❌ 请提供 total_budget 或至少一个 categories 额度");
      }

      if (total_budget !== undefined) {
        const updated = await updateMonthlyBudget(
          deps.db,
          userId,
          formatCents(parseCents(total_budget)),
        );
        if (updated === undefined) return text(`❌ 用户不存在：${userId}`);
      }

      if (hasCategories) {
        const month = monthOf();
        const existing = await listMonthBudgets(deps.db, userId, month);
        const current = await findUserById(deps.db, userId);
        const totalBudget = current?.monthlyBudget ?? "0";
        const merged = mergeAndValidateBudgets({
          existing,
          incoming: categories.map((item) => ({
            category: item.category.trim(),
            monthlyLimit: item.monthly_limit,
          })),
          totalBudget,
        });
        if (!merged.isValid) {
          return text(`❌ 预算未更新：${merged.message}`);
        }
        await upsertMonthBudgets(deps.db, userId, month, merged.merged);
      }

      return text(`✅ 预算已更新\n\n${await budgetSummary(deps.db, userId)}`);
    },
  );

  // ── Tool: 长任务 + 进度通知 ──
  server.registerTool(
    "long_running_task",
    {
      title: "耗时任务（进度通知）",
      description: "模拟一个耗时的异步任务，并向客户端汇报进度。steps: 步数",
      inputSchema: { steps: z.number().int().min(1).max(50) },
    },
    async ({ steps }, extra) => {
      const progressToken = extra._meta?.progressToken;

      for (let step = 1; step <= steps; step += 1) {
        await sleep(500);

        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: step, total: steps },
          });
        }
        await extra.sendNotification({
          method: "notifications/message",
          params: { level: "info", data: `已完成第 ${step}/${steps} 步` },
        });
      }

      return text(`成功完成全部 ${steps} 个步骤！`);
    },
  );

  // ── Tool: Tavily 联网搜索 ──
  server.registerTool(
    "web_search",
    {
      title: "联网搜索 / 深度研究",
      description:
        "使用 Tavily API 进行联网搜索（search）或深度研究（research）。" +
        "research 模式会提交异步任务并轮询结果（最多约 90 秒）。",
      inputSchema: {
        query: z.string().min(1),
        mode: z.enum(["search", "research"]).default("search"),
        search_depth: z.enum(["basic", "advanced"]).default("basic"),
        max_results: z.number().int().min(0).max(20).default(5),
        include_answer: z.enum(["basic", "advanced", "none"]).default("basic"),
        topic: z.enum(["general", "news", "finance"]).default("general"),
      },
    },
    async (args) =>
      text(
        await performWebSearch(
          {
            query: args.query,
            mode: args.mode,
            searchDepth: args.search_depth,
            maxResults: args.max_results,
            includeAnswer: args.include_answer,
            topic: args.topic,
          },
          deps,
        ),
      ),
  );

  // ── Tool: 知识库检索（P4b 接入 Milvus） ──
  server.registerTool(
    "knowledge_search",
    {
      title: "知识库混合检索（暂未接入）",
      description:
        "基于 BGE-M3 双向量 + Milvus 混合检索 + Reranker 的知识库查询。" +
        "当前为 P4a 占位实现，Milvus 检索将在 P4b 接入。",
      inputSchema: {
        query: z.string().min(1),
        top_k: z.number().int().min(1).max(10).default(3),
        category_filter: z.string().default(""),
        candidate_pool: z.number().int().min(1).max(50).default(10),
      },
    },
    ({ query }) =>
      text(`⚠️ 知识库检索尚未接入（P4b 将接入 Milvus + 推理 sidecar）。\n` + `🔍 查询: "${query}"`),
  );

  // ── Resource: 系统状态 ──
  server.registerResource(
    "system-status",
    "system://status",
    {
      title: "系统状态",
      description: "服务端当前的系统运行状态",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            status: "online",
            version: MCP_SERVER_VERSION,
            services: ["database", "cache"],
          }),
        },
      ],
    }),
  );

  // ── Resource: 用户 Profile（模板） ──
  const userProfileTemplate = new ResourceTemplate("users://{user_id}/profile", {
    list: undefined,
  });
  server.registerResource(
    "user-profile",
    userProfileTemplate,
    { title: "用户 Profile", description: "根据用户 ID 返回 Profile 信息", mimeType: "text/plain" },
    (uri, variables) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: `用户信息: ID=${String(variables.user_id)}, 角色=管理员, 状态=活跃`,
        },
      ],
    }),
  );

  // ── Prompt: 代码审查 ──
  server.registerPrompt(
    "code_review_prompt",
    {
      title: "代码审查",
      description: "生成专业的代码审查提示词",
      argsSchema: { language: z.string(), code: z.string() },
    },
    ({ language, code }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你是一位精通 ${language} 的高级工程师。\n请审查以下代码，检查性能问题、安全隐患以及代码规范：\n\n\`\`\`\n${code}\n\`\`\`\n`,
          },
        },
      ],
    }),
  );

  return server;
}
