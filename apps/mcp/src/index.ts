/**
 * @cyberbudget/mcp — MCP Server（P4a）。
 *
 * - `server.ts`：四个工具（其中一个为 P4b 占位）、两个资源、一个 prompt
 * - `http.ts`：Streamable HTTP 传输，端点 `/mcp`
 * - `tavily.ts`：Tavily 搜索 / 深度研究（可注入 fetch 与 sleep）
 */
export * from "./server.js";
export * from "./http.js";
export * from "./tavily.js";
