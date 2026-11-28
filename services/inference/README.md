# 推理 sidecar（Python / FastAPI）

Node 侧没有 BGE-M3（dense + sparse）和 BGE-Reranker-v2-M3 的等价实现，所以保留一个**极薄的**
Python 进程只做向量化与重排。Milvus 读写、混合检索编排、结果格式化全部在 `packages/knowledge`（TypeScript）。

## 端点

| 方法 | 路径      | 请求                                                | 响应                                                                               |
| ---- | --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| GET  | `/health` | —                                                   | `{ status, models: { embedding: {path, loaded}, reranker: {...} }, device, fp16 }` |
| POST | `/embed`  | `{ texts: string[] }`（1–32 条）                    | `{ dense: number[][]（1024 维）, sparse: Record<tokenId, weight>[] }`              |
| POST | `/rerank` | `{ query, documents: string[], top_n? }`（1–64 条） | `{ scores: number[] }`，**与 documents 同序**                                      |

`/rerank` 的 `top_n` 仅为兼容旧版调用方保留，实际排序与截断由 TS 侧做。

## 环境变量

| 变量                      | 默认                      | 说明                             |
| ------------------------- | ------------------------- | -------------------------------- |
| `EMBEDDING_MODEL_PATH`    | `BAAI/bge-m3`             | 本地目录或 HF repo id            |
| `RERANKER_MODEL_PATH`     | `BAAI/bge-reranker-v2-m3` | 同上                             |
| `EMBEDDING_USE_FP16`      | `false`                   | CPU 上开 fp16 不一定更快，默认关 |
| `INFERENCE_MAX_TEXTS`     | `32`                      | 单次向量化上限                   |
| `INFERENCE_MAX_DOCUMENTS` | `64`                      | 单次重排上限                     |

## 启动

```bash
# 模型在仓库外（tools/models），避免进 git
export EMBEDDING_MODEL_PATH=C:/Users/26289/Desktop/ediot/tools/models/bge-m3
export RERANKER_MODEL_PATH=C:/Users/26289/Desktop/ediot/tools/models/bge-reranker-v2-m3

tools/inference-venv/Scripts/python.exe -m uvicorn services.inference.app:app --host 127.0.0.1 --port 8100
```

模型惰性加载：进程秒起，第一次 `/embed` 才占内存（bge-m3 约 2.3 GB）。首次请求约 20–60 秒，之后单条
向量化约 100–300 ms。

## 与旧版的差异

旧版把模型直接放进业务进程（`scripts/init_knowledge_base.py` 里 `BGEM3FlagModel` + `FlagReranker`），
TS 版拆成 sidecar，好处是 Node 进程不需要 Python 运行时，且索引侧（`kb:init`）与检索侧共用同一份 HTTP 契约。
