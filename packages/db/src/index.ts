/**
 * @cyberbudget/db — 数据层：Drizzle schema、连接工厂、repository、领域纯函数。
 *
 * 对应旧项目：
 * - backend/models/*.py        → ./schema/*.js
 * - backend/config.py 的引擎    → ./client.js
 * - 各处 SQLAlchemy 查询        → ./repositories/*.js
 * - models/budget.py 的 merge   → ./services/budget-merge.js
 * - 方案 5.5 的超支判定          → ./services/budget-status.js
 */
export * from "./schema/index.js";
export * from "./client.js";
export * from "./repositories/users.js";
export * from "./repositories/transactions.js";
export * from "./repositories/budgets.js";
export * from "./repositories/chat.js";
export * from "./repositories/settings.js";
export * from "./repositories/memories.js";
export * from "./services/budget-merge.js";
export * from "./services/budget-status.js";
