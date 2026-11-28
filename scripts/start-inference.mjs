#!/usr/bin/env node
/**
 * 启动推理 sidecar（开发用）：`pnpm dev:inference`
 *
 * - Python 解释器优先用 `tools/inference-venv`（仓库内或仓库上一级的工作区目录），不存在则回退系统 `python`；
 * - 模型目录优先用 `tools/models/*`（同上，两处都找），不存在则回退 HuggingFace repo id（首次会下载）；
 * - 监听 127.0.0.1:8100，与 .env 的 INFERENCE_BASE_URL 对齐。
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
// 本地工具既可能放在仓库内（克隆者自己建），也可能放在仓库上一级的工作区目录（本机就是后者）
const toolRoots = [join(repoRoot, "tools"), resolve(repoRoot, "..", "tools")];
const firstExisting = (relative) => {
  for (const root of toolRoots) {
    const candidate = join(root, relative);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
};
const venvPython = firstExisting(join("inference-venv", "Scripts", "python.exe"));
const models = firstExisting("models");

const python = venvPython ?? (process.platform === "win32" ? "python" : "python3");
const embedPath =
  models && existsSync(join(models, "bge-m3")) ? join(models, "bge-m3") : "BAAI/bge-m3";
const rerankPath =
  models && existsSync(join(models, "bge-reranker-v2-m3"))
    ? join(models, "bge-reranker-v2-m3")
    : "BAAI/bge-reranker-v2-m3";

console.log(`[inference] python: ${python}`);
console.log(`[inference] embedding: ${embedPath}`);
console.log(`[inference] reranker : ${rerankPath}`);

const child = spawn(
  python,
  ["-m", "uvicorn", "services.inference.app:app", "--host", "127.0.0.1", "--port", "8100"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      EMBEDDING_MODEL_PATH: process.env.EMBEDDING_MODEL_PATH ?? embedPath,
      RERANKER_MODEL_PATH: process.env.RERANKER_MODEL_PATH ?? rerankPath,
      PYTHONUNBUFFERED: "1",
    },
  },
);

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
