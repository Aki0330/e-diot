import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMcpServer } from "./server.js";
import { formatSearchResults, performWebSearch } from "./tavily.js";

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.find((item) => item.type === "text")?.text ?? "";
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

const cleanup: (() => Promise<void>)[] = [];

async function connect(apiKey = ""): Promise<Client> {
  const server = createMcpServer({ apiKey, sleep: () => Promise.resolve() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);

  cleanup.push(async () => {
    await client.close();
    await server.close();
  });
  return client;
}

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(async (close) => close()));
});

describe("MCP tools", () => {
  it("注册四个工具", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "calculate_bmi",
      "knowledge_search",
      "long_running_task",
      "web_search",
    ]);
  });

  it("calculate_bmi 返回与旧实现一致的文案", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "calculate_bmi",
      arguments: { weight_kg: 70, height_m: 1.75 },
    });

    expect(textOf(result)).toBe("BMI 指数为: 22.86，属于【正常】区间。");
  });

  it("calculate_bmi 对非法身高返回错误文本", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "calculate_bmi",
      arguments: { weight_kg: 70, height_m: 0 },
    });

    expect(textOf(result)).toBe("错误：身高必须大于 0");
  });

  it("long_running_task 完成全部步骤", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "long_running_task",
      arguments: { steps: 3 },
    });

    expect(textOf(result)).toBe("成功完成全部 3 个步骤！");
  });

  it("knowledge_search 在 P4a 返回明确的占位提示", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "knowledge_search",
      arguments: { query: "外卖吃土怎么办" },
    });

    const text = textOf(result);
    expect(text).toContain("知识库检索尚未接入");
    expect(text).toContain("外卖吃土怎么办");
  });

  it("web_search 未配置 key 时给出提示", async () => {
    const client = await connect("");
    const result = await client.callTool({ name: "web_search", arguments: { query: "今天汇率" } });

    expect(textOf(result)).toContain("未配置 TAVILY_API_KEY");
  });
});

describe("MCP resources & prompts", () => {
  it("system://status 返回与旧实现相同的字段", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toContain("system://status");

    const result = await client.readResource({ uri: "system://status" });
    const text = (result.contents[0] as { text?: string }).text ?? "";
    expect(JSON.parse(text)).toEqual({
      status: "online",
      version: "1.0.0",
      services: ["database", "cache"],
    });
  });

  it("users://{user_id}/profile 模板可读取", async () => {
    const client = await connect();
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate)).toContain(
      "users://{user_id}/profile",
    );

    const result = await client.readResource({ uri: "users://usr_test_agent/profile" });
    const text = (result.contents[0] as { text?: string }).text ?? "";
    expect(text).toContain("ID=usr_test_agent");
  });

  it("code_review_prompt 生成审查提示词", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toContain("code_review_prompt");

    const result = await client.getPrompt({
      name: "code_review_prompt",
      arguments: { language: "TypeScript", code: "const x = 1;" },
    });
    const message = result.messages[0];
    const content = message?.content as { type: string; text?: string } | undefined;
    expect(content?.text).toContain("精通 TypeScript");
    expect(content?.text).toContain("const x = 1;");
  });
});

describe("Tavily", () => {
  const args = {
    query: "上海天气",
    mode: "search",
    searchDepth: "basic",
    maxResults: 2,
    includeAnswer: "basic",
    topic: "general",
  };

  it("formatSearchResults 与旧格式一致", () => {
    const text = formatSearchResults({
      answer: "今天晴",
      results: [
        { title: "天气网", url: "https://example.com", content: "x".repeat(350) },
        { title: "第二篇", url: "https://example.org", content: "短内容" },
      ],
      response_time: 0.42,
    });

    expect(text).toContain("📝 AI 摘要:\n今天晴");
    expect(text).toContain("🔗 搜索结果 (2 条):");
    expect(text).toContain("[1] 天气网");
    expect(text).toContain(`${"x".repeat(300)}...`);
    expect(text).toContain("⏱ 响应时间: 0.42s");
  });

  it("search 模式按旧参数调用 Tavily", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      sentBody = JSON.parse(typeof init?.body === "string" ? init.body : "{}") as Record<
        string,
        unknown
      >;
      return Promise.resolve(
        new Response(JSON.stringify({ results: [{ title: "标题", url: "u", content: "c" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const text = await performWebSearch(args, { apiKey: "tvly-test", fetchImpl });

    expect(text).toContain("[1] 标题");
    expect(sentBody).toMatchObject({
      api_key: "tvly-test",
      query: "上海天气",
      topic: "general",
      max_results: 2,
      search_depth: "basic",
      include_answer: "basic",
    });
  });

  it("search 请求失败时返回错误文本", async () => {
    const fetchImpl = vi.fn(async () => Promise.resolve(new Response("boom", { status: 500 })));

    const text = await performWebSearch(args, {
      apiKey: "k",
      fetchImpl,
    });

    expect(text).toContain("Tavily Search 请求失败: HTTP 500");
  });

  it("research 模式轮询到 completed 后返回报告", async () => {
    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      if (url.endsWith("/research")) return Promise.resolve(jsonResponse({ request_id: "req-1" }));
      return Promise.resolve(jsonResponse({ status: "completed", answer: "研究报告正文" }));
    });

    const text = await performWebSearch(
      { ...args, mode: "research" },
      { apiKey: "k", fetchImpl, sleep: () => Promise.resolve() },
    );

    expect(text).toBe("🔬 深度研究报告（耗时约 3s）:\n\n研究报告正文");
  });

  it("research 轮询 30 次仍未完成时超时", async () => {
    const fetchImpl = vi.fn<typeof fetch>((input) => {
      const url = urlOf(input);
      if (url.endsWith("/research")) return Promise.resolve(jsonResponse({ request_id: "req-2" }));
      return Promise.resolve(jsonResponse({ status: "pending" }));
    });

    const text = await performWebSearch(
      { ...args, mode: "research" },
      { apiKey: "k", fetchImpl, sleep: () => Promise.resolve() },
    );

    expect(text).toContain("任务超时（超过 90s）");
    expect(fetchImpl).toHaveBeenCalledTimes(31);
  });

  it("research 提交失败时返回错误文本", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({})));

    const text = await performWebSearch(
      { ...args, mode: "research" },
      { apiKey: "k", fetchImpl, sleep: () => Promise.resolve() },
    );

    expect(text).toContain("未获取到 request_id");
  });
});
