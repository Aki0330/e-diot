/**
 * OpenAI 兼容客户端（DeepSeek 默认）。
 *
 * 与旧 `backend/llm/llm.py` 的 `get_llm_client()` 等价，但用原生 `fetch` 实现，
 * 少一个依赖；`baseUrl` 直接复用 `.env.local` 里的 `LLM_BASE_URL`。
 */

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface LlmClient {
  complete(messages: readonly ChatMessage[]): Promise<string>;
}

export interface LlmClientOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs?: number;
}

interface ChatCompletionResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[];
}

export function createOpenAiCompatibleClient(options: LlmClientOptions): LlmClient {
  return {
    async complete(messages) {
      if (options.apiKey.trim() === "") {
        throw new Error("未配置 LLM_API_KEY");
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
      try {
        const response = await fetch(`${options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({ model: options.model, messages, stream: false }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 200)}`);
        }

        const data = (await response.json()) as ChatCompletionResponse;
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.trim() === "") {
          throw new Error("LLM 返回内容为空或格式异常");
        }
        return content;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
