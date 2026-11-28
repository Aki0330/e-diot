import { describe, expect, it, vi } from "vitest";

import type { InferenceClient } from "@cyberbudget/inference";

import { ingestCorpus } from "./bootstrap.js";
import type { KnowledgeDoc, KnowledgeEntry, VectorHit, VectorStore } from "./types.js";
import { KnowledgeError } from "./types.js";

const CORPUS: readonly KnowledgeDoc[] = [
  { category: "category_rule", content: "规则一", metadata: { tags: ["餐饮"] } },
  { category: "saving_advice", content: "建议二", metadata: {} },
];

interface FakeInference {
  readonly inference: InferenceClient;
  readonly embed: ReturnType<typeof vi.fn>;
  readonly rerank: ReturnType<typeof vi.fn>;
}

function fakeInference(
  overrides: Partial<InferenceClient> = {},
  embedImpl: (texts: readonly string[]) => Promise<unknown> = (texts) =>
    Promise.resolve({
      dense: texts.map(() => [0.1, 0.2]),
      sparse: texts.map(() => ({ "1": 0.5 })),
    }),
): FakeInference {
  const embed = vi.fn(embedImpl);
  const rerank = vi.fn(() => Promise.resolve({ scores: [] }));
  const inference: InferenceClient = {
    embed: embed as unknown as InferenceClient["embed"],
    rerank: rerank,
    ...overrides,
  };
  return { inference, embed, rerank };
}

interface FakeStore {
  readonly store: VectorStore;
  readonly hybridSearch: ReturnType<typeof vi.fn>;
  readonly insert: ReturnType<typeof vi.fn>;
  readonly count: ReturnType<typeof vi.fn>;
  readonly recreate: ReturnType<typeof vi.fn>;
}

function fakeStore(overrides: Partial<VectorStore> = {}): FakeStore {
  const hybridSearch = vi.fn(() => Promise.resolve<readonly VectorHit[]>([]));
  const insert = vi.fn((entries: readonly KnowledgeEntry[]) => Promise.resolve(entries.length));
  const count = vi.fn(() => Promise.resolve(2));
  const recreate = vi.fn(() => Promise.resolve());
  const store: VectorStore = { hybridSearch, insert, count, recreate, ...overrides };
  return { store, hybridSearch, insert, count, recreate };
}

describe("ingestCorpus", () => {
  it("recreate 时重建 collection，并把向量与语料一起写入", async () => {
    const { store, recreate, insert } = fakeStore();
    const result = await ingestCorpus(
      { inference: fakeInference().inference, store },
      { corpus: CORPUS, recreate: true },
    );

    expect(recreate).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({
        content: "规则一",
        vector: [0.1, 0.2],
        sparseVector: { "1": 0.5 },
      }),
      expect.objectContaining({ content: "建议二" }),
    ]);
    expect(result).toEqual({ inserted: 2, total: 2, collectionSize: 2 });
  });

  it("未指定 recreate 时只追加", async () => {
    const { store, recreate } = fakeStore();
    await ingestCorpus({ inference: fakeInference().inference, store }, { corpus: CORPUS });
    expect(recreate).not.toHaveBeenCalled();
  });

  it("--append 时不重建", async () => {
    const { store, recreate } = fakeStore();
    await ingestCorpus(
      { inference: fakeInference().inference, store },
      { corpus: CORPUS, recreate: false },
    );
    expect(recreate).not.toHaveBeenCalled();
  });

  it("向量数量与语料不一致时报 inference_unavailable", async () => {
    const { inference } = fakeInference({}, () =>
      Promise.resolve({ dense: [[0.1]], sparse: [{ "1": 0.2 }] }),
    );
    const error = await ingestCorpus(
      { inference, store: fakeStore().store },
      { corpus: CORPUS },
    ).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(KnowledgeError);
    expect((error as KnowledgeError).code).toBe("inference_unavailable");
  });

  it("空语料直接报错", async () => {
    await expect(
      ingestCorpus(
        { inference: fakeInference().inference, store: fakeStore().store },
        { corpus: [] },
      ),
    ).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
