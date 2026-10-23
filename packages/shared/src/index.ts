/**
 * @cyberbudget/shared — 跨包共享的配置、错误模型、zod schema 与领域类型。
 *
 * 对应旧项目：
 * - backend/config.py          → ./config.js
 * - 各处 HTTPException/ValueError → ./errors.js
 * - backend/schemas/*.py       → ./schemas/*.js
 * - backend/agent/state.py     → ./schemas/intent.js
 * - backend/api/v1/auth.py 的 generate_user_id → ./auth/user-id.js
 */
export * from "./config.js";
export * from "./errors.js";
export * from "./money.js";
export * from "./types.js";
export * from "./auth/user-id.js";
export * from "./schemas/common.js";
export * from "./schemas/auth.js";
export * from "./schemas/budget.js";
export * from "./schemas/chat.js";
export * from "./schemas/intent.js";
