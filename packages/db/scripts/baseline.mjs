#!/usr/bin/env node
/**
 * 给「已经存在业务表」的数据库打 drizzle 基线标记（不进 git 的历史数据）。
 *
 * 场景：旧库（users/transactions/budgets/chat_* 都已存在且结构与 baseline 一致）
 * 不能直接跑 `db:migrate`，否则会重复 CREATE TABLE 报错。本脚本只做两件事：
 *   1. 确认业务表确实存在；
 *   2. 把 baseline 迁移记录写入 drizzle.__drizzle_migrations，让后续 migrate 只跑新增迁移。
 *
 * 空库请直接：pnpm --filter @cyberbudget/db db:migrate
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const migrationsFolder = resolve(here, "../migrations");

for (const file of [".env.local", ".env"]) {
  const path = join(repoRoot, file);
  if (existsSync(path)) process.loadEnvFile(path);
}

// 与 packages/shared/src/config.ts 的 databaseUrlFromEnv 保持一致（脚本不依赖构建产物）
function databaseUrlFromEnv(env) {
  const override = env.DATABASE_URL?.trim();
  if (override) return override;
  const user = encodeURIComponent(env.DB_USER?.trim() || "postgres");
  const password = encodeURIComponent(env.DB_PASSWORD ?? "postgrespassword");
  const host = env.DB_HOST?.trim() || "localhost";
  const port = env.DB_PORT || 5432;
  const name = env.DB_NAME?.trim() || "cyber_budget_db";
  return `postgresql://${user}:${password}@${host}:${port}/${name}`;
}

const journalPath = join(migrationsFolder, "meta/_journal.json");
if (!existsSync(journalPath)) {
  console.error(
    `找不到迁移清单：${journalPath}（先运行 pnpm --filter @cyberbudget/db db:generate）`,
  );
  process.exit(1);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const migrations = journal.entries.map((entry) => {
  const sql = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf8");
  return {
    tag: entry.tag,
    createdAt: entry.when,
    hash: createHash("sha256").update(sql).digest("hex"),
  };
});

const client = new pg.Client({ connectionString: databaseUrlFromEnv(process.env) });
await client.connect();

try {
  const exists = await client.query("select to_regclass('public.transactions') as regclass");
  if (exists.rows[0]?.regclass === null) {
    console.error("当前库没有业务表，请直接运行：pnpm --filter @cyberbudget/db db:migrate");
    process.exitCode = 1;
  } else {
    await client.query('create schema if not exists "drizzle"');
    await client.query(
      'create table if not exists "drizzle"."__drizzle_migrations" (id serial primary key, hash text not null, created_at bigint)',
    );

    const applied = await client.query(
      'select created_at from "drizzle"."__drizzle_migrations" order by created_at desc limit 1',
    );
    const lastCreatedAt = applied.rows[0]?.created_at;
    let inserted = 0;

    for (const migration of migrations) {
      if (lastCreatedAt !== undefined && Number(lastCreatedAt) >= migration.createdAt) {
        console.log(`已存在，跳过：${migration.tag}`);
        continue;
      }
      await client.query(
        'insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)',
        [migration.hash, migration.createdAt],
      );
      inserted += 1;
      console.log(`已打基线：${migration.tag} (${migration.hash.slice(0, 12)}…)`);
    }

    console.log(
      inserted === 0
        ? "基线已是最新，无需变更。"
        : `基线完成（${inserted} 条）。后续 db:migrate 只会执行新增迁移。`,
    );
  }
} finally {
  await client.end();
}
