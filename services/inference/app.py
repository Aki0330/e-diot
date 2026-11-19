"""推理 sidecar：BGE-M3 双向量 + BGE-Reranker-V2-M3（对应旧版 FlagEmbedding 用法）。

只做两件事，业务逻辑全部在 TS 侧：

    POST /embed   { texts: string[] }                  → { dense: number[][], sparse: SparseVector[] }
    POST /rerank  { query, documents, top_n? }         → { scores: number[] }   # 与 documents 同序
    GET  /health                                        → { status, models, device }

模型两个都是惰性加载：sidecar 起来很快，第一次请求才吃内存（bge-m3 约 2.3 GB）。
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from FlagEmbedding import BGEM3FlagModel, FlagReranker

EMBEDDING_MODEL_PATH = os.environ.get("EMBEDDING_MODEL_PATH", "BAAI/bge-m3")
RERANKER_MODEL_PATH = os.environ.get("RERANKER_MODEL_PATH", "BAAI/bge-reranker-v2-m3")
USE_FP16 = os.environ.get("EMBEDDING_USE_FP16", "false").lower() in {"1", "true", "yes"}
MAX_TEXTS = int(os.environ.get("INFERENCE_MAX_TEXTS", "32"))
MAX_DOCUMENTS = int(os.environ.get("INFERENCE_MAX_DOCUMENTS", "64"))

app = FastAPI(title="e-diot inference sidecar", version="1.0.0")

_lock = threading.Lock()
_embedder: BGEM3FlagModel | None = None
_reranker: FlagReranker | None = None


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_TEXTS)


class EmbedResponse(BaseModel):
    dense: list[list[float]]
    sparse: list[dict[str, float]]


class RerankRequest(BaseModel):
    query: str = Field(min_length=1)
    documents: list[str] = Field(min_length=1, max_length=MAX_DOCUMENTS)
    top_n: int | None = None


class RerankResponse(BaseModel):
    scores: list[float]


def _get_embedder() -> BGEM3FlagModel:
    global _embedder
    if _embedder is None:
        with _lock:
            if _embedder is None:
                started = time.time()
                _embedder = BGEM3FlagModel(EMBEDDING_MODEL_PATH, use_fp16=USE_FP16)
                print(f"[inference] bge-m3 loaded in {time.time() - started:.1f}s", flush=True)
    return _embedder


def _get_reranker() -> FlagReranker:
    global _reranker
    if _reranker is None:
        with _lock:
            if _reranker is None:
                started = time.time()
                _reranker = FlagReranker(RERANKER_MODEL_PATH, use_fp16=USE_FP16)
                print(f"[inference] reranker loaded in {time.time() - started:.1f}s", flush=True)
    return _reranker


def _fail(action: str, error: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail=f"{action}失败: {type(error).__name__}: {error}")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "models": {
            "embedding": {"path": EMBEDDING_MODEL_PATH, "loaded": _embedder is not None},
            "reranker": {"path": RERANKER_MODEL_PATH, "loaded": _reranker is not None},
        },
        "device": "cpu",
        "fp16": USE_FP16,
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(request: EmbedRequest) -> dict[str, Any]:
    try:
        model = _get_embedder()
        output = model.encode(
            request.texts,
            batch_size=min(8, len(request.texts)),
            max_length=512,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
    except Exception as error:  # noqa: BLE001 - sidecar 边界统一转 503
        raise _fail("向量化", error) from error

    dense = [[float(x) for x in row] for row in output["dense_vecs"]]
    sparse: list[dict[str, float]] = []
    for weights in output["lexical_weights"]:
        sparse.append({str(token): float(weight) for token, weight in weights.items()})
    return {"dense": dense, "sparse": sparse}


@app.post("/rerank", response_model=RerankResponse)
def rerank(request: RerankRequest) -> dict[str, Any]:
    try:
        model = _get_reranker()
        pairs = [[request.query, document] for document in request.documents]
        raw = model.compute_score(pairs, normalize=True)
    except Exception as error:  # noqa: BLE001
        raise _fail("重排", error) from error

    if isinstance(raw, (int, float)):
        raw = [raw]
    return {"scores": [float(score) for score in raw]}
