import { connectDatabase } from "@cyberbudget/db";
import type { AppConfig } from "@cyberbudget/shared";
import type { FastifyInstance } from "fastify";

/**
 * 注入数据库：连接池 + drizzle 实例，应用关闭时释放连接池。
 * 与旧 `get_db` 的差异：不再有隐式 commit，事务由 repository 调用方显式开启。
 */
export function registerDb(app: FastifyInstance, config: AppConfig): void {
  const handle = connectDatabase(config);
  app.decorate("db", handle.db);
  app.addHook("onClose", async () => {
    await handle.close();
  });
}
