import { getConfig, type AppConfig } from "@cyberbudget/shared";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

/**
 * 数据层入口。
 *
 * 与旧 `backend/config.py` 的 `_get_engine` / `get_db` 对应，但**不复刻**旧实现里
 * 「`async for` + `return` 跳过 commit」的工作区模式（方案 6.5）：
 * 这里把连接池、drizzle 实例、事务边界都显式交给调用方。
 */

export type Database = NodePgDatabase<typeof schema>;

/** repository 函数统一接收的「可执行者」：普通连接或事务内连接 */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: Pool;
  close(): Promise<void>;
}

export function createPool(config: AppConfig): Pool {
  let connectionString = config.db.url;
  if (config.db.ssl) {
    // pg 会用连接串中的 SSL 选项覆盖 Pool 选项。保留自定义 CA，同时要求校验证书和主机名。
    const url = new URL(connectionString);
    url.searchParams.set("sslmode", "verify-full");
    connectionString = url.toString();
  }
  return new Pool({
    connectionString,
    max: config.db.poolMax,
  });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema });
}

/** 建连接池 + drizzle 实例；调用方负责在退出时 `close()` */
export function connectDatabase(config: AppConfig = getConfig()): DatabaseHandle {
  const pool = createPool(config);
  const db = createDatabase(pool);
  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}
