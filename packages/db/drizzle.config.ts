import { databaseUrlFromEnv, loadEnvFiles } from "@cyberbudget/shared";
import { defineConfig } from "drizzle-kit";

// drizzle-kit 从 packages/db 目录运行；loadEnvFiles 会向上找到仓库根目录的 .env.local
loadEnvFiles();

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: databaseUrlFromEnv() },
  strict: true,
  verbose: true,
});
