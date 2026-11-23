import { describe, expect, it, vi } from "vitest";

import { createInferenceClient, InferenceError } from "./client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okResponse(body: unknown): Promise<Response> {
  return Promise.resolve(jsonResponse(body));
}

const EMBED_BODY = {
  dense: [[0.1, 0.2]],
  sparse: [{ "12": 0.5 }],
};

function client(fetchImpl: typeof fetch, retries = 2) {
  return createInferenceClient({
    baseUrl: "http://127.0.0.1:8100/",
    retries,
    fetchImpl,
    sleep: () => Promise.resolve(),
  });
}

describe("createInferenceClient", () => {
  it("embed 解析 dense / sparse，并打到去掉尾斜杠的地址", async () => {
    const fetchImpl = vi.fn(() => okResponse(EMBED_BODY));
    const result = await client(fetchImpl).embed(["你好"]);

    expect(result.dense).toEqual([[0.1, 0.2]]);
    expect(result.sparse).toEqual([{ "12": 0.5 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8100/embed",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rerank 透传 query/documents 并解析 scores", async () => {
    const fetchImpl = vi.fn(() => okResponse({ scores: [0.9, 0.1] }));
    const result = await client(fetchImpl).rerank({
      query: "q",
      documents: ["a", "b"],
    });

    expect(result.scores).toEqual([0.9, 0.1]);
    const call = fetchImpl.mock.calls[0] as [string, RequestInit | undefined] | undefined;
    const body = call?.[1]?.body as string;
    expect(JSON.parse(body)).toEqual({ query: "q", documents: ["a", "b"] });
  });

  it("5xx 会重试，成功即返回", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: "loading" }, 503))
      .mockResolvedValueOnce(jsonResponse(EMBED_BODY));

    const result = await client(fetchImpl).embed(["你好"]);
    expect(result.dense).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("4xx 不重试，直接抛带 status 的 InferenceError", async () => {
    const failing = vi.fn(() => Promise.resolve(jsonResponse({ detail: "texts 不能为空" }, 422)));
    const error = await client(failing)
      .embed([])
      .catch((err: unknown) => err);

    expect(failing).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(InferenceError);
    expect((error as InferenceError).status).toBe(422);
    expect((error as InferenceError).endpoint).toBe("/embed");
  });

  it("网络错误重试到上限后抛错", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    const error = await client(fetchImpl, 1)
      .embed(["x"])
      .catch((err: unknown) => err);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((error as InferenceError).message).toContain("ECONNREFUSED");
  });

  it("响应结构不合法时抛错", async () => {
    const fetchImpl = vi.fn(() => okResponse({ dense: [[0.1]], sparse: [{ a: "b" }] }));
    const error = await client(fetchImpl)
      .embed(["x"])
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(InferenceError);
    expect((error as InferenceError).message).toContain("sparse 权重不是 number");
  });
});
