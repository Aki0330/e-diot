import { describe, expect, it, vi } from "vitest";

import type { InferenceClient } from "@cyberbudget/inference";

import { searchKnowledge } from "./search.js";
import { KnowledgeError, type HybridQuery, type VectorHit, type VectorStore } from "./types.js";

interface FakeInference {
  readonly inference: InferenceClient;
  readonly embed: ReturnType<typeof vi.fn>;
  readonly rerank: ReturnType<typeof vi.fn>;
}

function fakeInference(
  overrides: Partial<InferenceClient> = {},
  rerankImpl: (request: { query: string; documents: readonly string[] }) => Promise<unknown> = (
    request,
  ) => Promise.resolve({ scores: request.documents.map(() => 0.5) }),
): FakeInference {
  const embed = vi.fn((texts: readonly string[]) =>
    Promise.resolve({
      dense: texts.map(() => [0.1, 0.2, 0.3]),
      sparse: texts.map(() => ({ "7": 0.5 })),
    }),
  );
  const rerank = vi.fn(rerankImpl);
  const inference: InferenceClient = {
    embed: embed,
    rerank: rerank as unknown as InferenceClient["rerank"],
    ...overrides,
  };
  return { inference, embed, rerank };
}

interface FakeStore {
  readonly store: VectorStore;
  readonly hybridSearch: ReturnType<typeof vi.fn>;
}

function fakeStore(hits: readonly VectorHit[], overrides: Partial<VectorStore> = {}): FakeStore {
  const hybridSearch = vi.fn(() => Promise.resolve(hits));
  const store: VectorStore = {
    hybridSearch: hybridSearch,
    insert: () => Promise.resolve(0),
    count: () => Promise.resolve(hits.length),
    recreate: () => Promise.resolve(),
    ...overrides,
  };
  return { store, hybridSearch };
}

const HIT_A: VectorHit = {
  content: "A",
  category: "saving_advice",
  metadata: {},
  score: 0.9,
};
const HIT_B: VectorHit = { content: "B", category: "category_rule", metadata: {}, score: 0.8 };
const HIT_C: VectorHit = { content: "C", category: "category_rule", metadata: {}, score: 0.7 };

describe("searchKnowledge", () => {
  it("把候选池设为 max(candidate_pool, top_k * 2)", async () => {
    const { store, hybridSearch } = fakeStore([HIT_A]);
    await searchKnowledge(
      { inference: fakeInference().inference, store },
      { query: "q", topK: 3, candidatePool: 4 },
    );
    expect(hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 6 }) satisfies Partial<HybridQuery>,
    );
  });

  it("候选池大于 top_k*2 时保留候选池", async () => {
    const { store, hybridSearch } = fakeStore([HIT_A]);
    await searchKnowledge(
      { inference: fakeInference().inference, store },
      { query: "q", topK: 1, candidatePool: 10 },
    );
    expect(hybridSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("按精排分数降序截断到 top_k", async () => {
    const { store } = fakeStore([HIT_A, HIT_B, HIT_C]);
    const { inference } = fakeInference({}, () => Promise.resolve({ scores: [0.1, 0.9, 0.5] }));

    const hits = await searchKnowledge({ inference, store }, { query: "q", topK: 2 });
    expect(hits.map((hit) => hit.content)).toEqual(["B", "C"]);
    expect(hits[0]?.rerankScore).toBe(0.9);
  });

  it("透传分类过滤，空串则不加 expr", async () => {
    const { store, hybridSearch } = fakeStore([HIT_A]);
    const deps = { inference: fakeInference().inference, store };
    await searchKnowledge(deps, { query: "q", categoryFilter: "saving_advice" });
    expect(hybridSearch).toHaveBeenCalledWith(
      expect.objectContaining({ category: "saving_advice" }),
    );

    hybridSearch.mockClear();
    await searchKnowledge(deps, { query: "q", categoryFilter: "  " });
    const lastCall = hybridSearch.mock.calls.at(-1)?.[0] as Partial<HybridQuery> | undefined;
    expect(lastCall).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(lastCall ?? {}, "category")).toBe(false);
  });

  it("候选为空时直接返回，不再调用 rerank", async () => {
    const { inference, rerank } = fakeInference();
    const hits = await searchKnowledge({ inference, store: fakeStore([]).store }, { query: "q" });
    expect(hits).toEqual([]);
    expect(rerank).not.toHaveBeenCalled();
  });

  it("空查询报 invalid_argument", async () => {
    await expect(
      searchKnowledge(
        { inference: fakeInference().inference, store: fakeStore([]).store },
        { query: "   " },
      ),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("推理失败映射为 inference_unavailable", async () => {
    const { inference } = fakeInference({}, () => Promise.resolve({ scores: [] }));
    const failingInference: InferenceClient = {
      ...inference,
      embed: () => Promise.reject(new Error("ECONNREFUSED")),
    };
    const error = await searchKnowledge(
      { inference: failingInference, store: fakeStore([HIT_A]).store },
      { query: "q" },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(KnowledgeError);
    expect((error as KnowledgeError).code).toBe("inference_unavailable");
    expect((error as KnowledgeError).message).toContain("ECONNREFUSED");
  });

  it("向量库失败映射为 milvus_unavailable", async () => {
    const { store } = fakeStore([], {
      hybridSearch: () => Promise.reject(new Error("collection not loaded")),
    });
    const error = await searchKnowledge(
      { inference: fakeInference().inference, store },
      { query: "q" },
    ).catch((err: unknown) => err);

    expect((error as KnowledgeError).code).toBe("milvus_unavailable");
    expect((error as KnowledgeError).message).toContain("collection not loaded");
  });

  it("rerank 分数数量与候选不一致时报错", async () => {
    const { inference } = fakeInference({}, () => Promise.resolve({ scores: [0.5] }));
    const error = await searchKnowledge(
      { inference, store: fakeStore([HIT_A, HIT_B]).store },
      { query: "q" },
    ).catch((err: unknown) => err);

    expect((error as KnowledgeError).code).toBe("unknown");
    expect((error as KnowledgeError).message).toContain("不一致");
  });

  it("topK 超过 10 时收敛到 10", async () => {
    const { store, hybridSearch } = fakeStore([HIT_A]);
    await searchKnowledge(
      { inference: fakeInference().inference, store },
      { query: "q", topK: 99 },
    );
    expect(hybridSearch).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });
});
