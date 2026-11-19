/**
 * HTTP 版本的推理客户端：调用 `services/inference`（FastAPI）的 `/embed` 与 `/rerank`。
 *
 * 设计要点：
 * - `fetchImpl` / `sleep` 可注入，单测不碰网络；
 * - 超时用 `AbortSignal.timeout`，失败统一抛 `InferenceError`（带 status / 端点，便于上层降级）；
 * - 只对 5xx 与网络错误重试，4xx（参数错）立即返回，避免无意义重试。
 */

import type {
  EmbedRequest,
  EmbedResponse,
  InferenceClient,
  RerankRequest,
  RerankResponse,
  SparseVector,
} from "./index.js";

export interface InferenceClientOptions {
  /** sidecar 地址，例如 http://127.0.0.1:8100 */
  readonly baseUrl: string;
  /** 单次请求超时，默认 60 s（首次请求要加载模型） */
  readonly timeoutMs?: number;
  /** 失败重试次数，默认 2（即最多 3 次请求） */
  readonly retries?: number;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

export class InferenceError extends Error {
  override readonly name = "InferenceError";

  constructor(
    message: string,
    readonly endpoint: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    throw new InferenceError(`响应字段 ${field} 不是 number[]`, field);
  }
  return value as number[];
}

function denseMatrix(value: unknown): number[][] {
  if (!Array.isArray(value)) throw new InferenceError("响应字段 dense 不是数组", "dense");
  return value.map((row) => numberArray(row, "dense"));
}

function sparseVectors(value: unknown): SparseVector[] {
  if (!Array.isArray(value)) throw new InferenceError("响应字段 sparse 不是数组", "sparse");
  return value.map((item) => {
    if (!isRecord(item)) throw new InferenceError("sparse 元素不是对象", "sparse");
    const vector: Record<string, number> = {};
    for (const [token, weight] of Object.entries(item)) {
      if (typeof weight !== "number") {
        throw new InferenceError(`sparse 权重不是 number（token=${token}）`, "sparse");
      }
      vector[token] = weight;
    }
    return vector;
  });
}

export function createInferenceClient(options: InferenceClientOptions): InferenceClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 2;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  async function post<T>(endpoint: string, body: unknown, parse: (data: unknown) => T): Promise<T> {
    const url = `${baseUrl}${endpoint}`;
    let lastError: InferenceError | undefined;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) await sleep(200 * attempt);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastError = new InferenceError(
          `${endpoint} 请求失败：${error instanceof Error ? error.message : String(error)}`,
          endpoint,
        );
        continue;
      }

      if (response.ok) {
        const data: unknown = await response.json().catch((error: unknown) => {
          throw new InferenceError(`${endpoint} 返回的不是 JSON：${String(error)}`, endpoint, response.status);
        });
        return parse(data);
      }

      const detail = await response.text().catch(() => "");
      lastError = new InferenceError(
        `${endpoint} 返回 ${response.status}：${detail.slice(0, 200)}`,
        endpoint,
        response.status,
      );
      if (response.status < 500) throw lastError;
    }

    throw lastError ?? new InferenceError(`${endpoint} 未知失败`, endpoint);
  }

  return {
    embed(texts: readonly string[]): Promise<EmbedResponse> {
      const request: EmbedRequest = { texts };
      return post("/embed", request, (data) => {
        if (!isRecord(data)) throw new InferenceError("响应不是对象", "/embed");
        return { dense: denseMatrix(data["dense"]), sparse: sparseVectors(data["sparse"]) };
      });
    },

    rerank(request: RerankRequest): Promise<RerankResponse> {
      return post("/rerank", request, (data) => {
        if (!isRecord(data)) throw new InferenceError("响应不是对象", "/rerank");
        return { scores: numberArray(data["scores"], "scores") };
      });
    },
  };
}
