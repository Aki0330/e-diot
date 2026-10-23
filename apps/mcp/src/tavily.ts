/**
 * Tavily 联网搜索（对应旧 `backend/mcp/server.py` 的 `_tavily_search` / `_tavily_research`
 * / `_format_search_results`）。
 *
 * `fetch` 与 `sleep` 可注入，测试不需要真的联网/等待。
 */

export interface WebSearchOptions {
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface SearchArgs {
  readonly query: string;
  readonly mode: string;
  readonly searchDepth: string;
  readonly maxResults: number;
  readonly includeAnswer: string;
  readonly topic: string;
}

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_RESEARCH_URL = "https://api.tavily.com/research";

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

interface TavilyResponse {
  readonly answer?: string;
  readonly results?: readonly { title?: string; url?: string; content?: string }[];
  readonly response_time?: number;
}

/** 将 Tavily Search 响应格式化为可读文本（与旧 `_format_search_results` 一致） */
export function formatSearchResults(data: TavilyResponse): string {
  const lines: string[] = [];

  if (data.answer !== undefined && data.answer !== "") {
    lines.push(`📝 AI 摘要:\n${data.answer}\n`);
  }

  const results = data.results ?? [];
  if (results.length > 0) {
    lines.push(`🔗 搜索结果 (${results.length} 条):`);
    results.forEach((result, index) => {
      const title = result.title ?? "无标题";
      const url = result.url ?? "";
      let content = result.content ?? "";
      if (content.length > 300) content = `${content.slice(0, 300)}...`;
      lines.push(`\n  [${index + 1}] ${title}\n      URL: ${url}\n      ${content}`);
    });
  } else {
    lines.push("未找到相关搜索结果。");
  }

  if (data.response_time !== undefined) {
    lines.push(`\n⏱ 响应时间: ${String(data.response_time)}s`);
  }

  return lines.join("\n");
}

async function readError(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return response.statusText;
  }
}

export async function performWebSearch(
  args: SearchArgs,
  options: WebSearchOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  if (options.apiKey.trim() === "") {
    return "错误：未配置 TAVILY_API_KEY，请在 .env.local 中填入你的 Tavily API Key";
  }

  if (args.mode === "research") {
    return performResearch(args, options.apiKey, fetchImpl, sleep);
  }
  return performSearch(args, options.apiKey, fetchImpl);
}

async function performSearch(
  args: SearchArgs,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query: args.query,
    topic: args.topic,
    max_results: Math.min(Math.max(args.maxResults, 1), 20),
  };

  if (args.searchDepth === "basic" || args.searchDepth === "advanced") {
    body.search_depth = args.searchDepth;
  }
  if (args.includeAnswer === "advanced") body.include_answer = "advanced";
  else if (args.includeAnswer === "basic") body.include_answer = "basic";

  try {
    const response = await fetchImpl(TAVILY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return `Tavily Search 请求失败: HTTP ${response.status} ${await readError(response)}`;
    }
    return formatSearchResults((await response.json()) as TavilyResponse);
  } catch (error) {
    return `Tavily Search 请求失败: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function performResearch(
  args: SearchArgs,
  apiKey: string,
  fetchImpl: typeof fetch,
  sleep: (ms: number) => Promise<void>,
): Promise<string> {
  let requestId: string;
  try {
    const response = await fetchImpl(TAVILY_RESEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query: args.query, topic: args.topic }),
    });
    if (!response.ok) {
      return `Tavily Research 提交任务失败: HTTP ${response.status} ${await readError(response)}`;
    }
    const task = (await response.json()) as { request_id?: string };
    if (task.request_id === undefined || task.request_id === "") {
      return `Research 任务提交失败，未获取到 request_id: ${JSON.stringify(task)}`;
    }
    requestId = task.request_id;
  } catch (error) {
    return `Tavily Research 提交任务失败: ${error instanceof Error ? error.message : String(error)}`;
  }

  // 轮询：3 秒 × 30 次（保留旧实现的上限）
  const pollInterval = 3_000;
  const maxAttempts = 30;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await sleep(pollInterval);

    let statusData: { status?: string; answer?: string; results?: { answer?: string } };
    try {
      const response = await fetchImpl(`${TAVILY_RESEARCH_URL}/${requestId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) {
        return `Tavily Research 轮询失败 (第 ${attempt} 次): HTTP ${response.status} ${await readError(response)}`;
      }
      statusData = (await response.json()) as typeof statusData;
    } catch (error) {
      return `Tavily Research 轮询失败 (第 ${attempt} 次): ${error instanceof Error ? error.message : String(error)}`;
    }

    if (statusData.status === "completed") {
      const answer = statusData.answer ?? statusData.results?.answer;
      if (answer !== undefined && answer !== "") {
        return `🔬 深度研究报告（耗时约 ${attempt * 3}s）:\n\n${answer}`;
      }
      return `🔬 深度研究完成，原始结果:\n${JSON.stringify(statusData, null, 2)}`;
    }

    if (statusData.status === "failed") {
      return `Tavily Research 任务失败: ${JSON.stringify(statusData)}`;
    }
  }

  return `Tavily Research 任务超时（超过 ${maxAttempts * 3}s），request_id: ${requestId}，请稍后手动查询`;
}
