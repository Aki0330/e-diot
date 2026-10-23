import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  resolve: {
    // 测试直接跑源码，避免必须先 pnpm build 才能跑单测
    alias: {
      "@cyberbudget/shared": fromRoot("./packages/shared/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    reporters: ["default"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      // 只统计纯函数（P1 验收：预算 merge 覆盖率 100%）
      include: [
        "packages/db/src/services/**/*.ts",
        "packages/shared/src/money.ts",
        "packages/shared/src/auth/**/*.ts",
      ],
      exclude: ["**/*.test.ts"],
    },
  },
});
