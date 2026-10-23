import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createMcpServer, type McpServerDeps } from "./server.js";

/**
 * Streamable HTTP 传输（对应旧 `mcp.run(transport="http", port=8001)`，端点为 `/mcp`）。
 *
 * 有状态模式：第一次 `initialize` 时创建 server + transport，并把 `mcp-session-id`
 * 记在内存表里，后续 `tools/list`、`tools/call` 复用同一会话。
 * 使用 `enableJsonResponse` 让 POST 返回单个 JSON（而不是长连接 SSE），
 * 对 curl / Inspector 都更友好。
 */

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 1024 * 1024;

const transports = new Map<string, StreamableHTTPServerTransport>();

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    req.on("error", reject);
  });
}

function sessionIdOf(req: IncomingMessage): string | undefined {
  const header = req.headers["mcp-session-id"];
  return typeof header === "string" ? header : undefined;
}

async function handleRequest(
  deps: McpServerDeps,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (url.pathname !== MCP_PATH) {
    sendJson(res, 404, { jsonrpc: "2.0", error: { code: -32001, message: "Not Found" }, id: null });
    return;
  }

  const sessionId = sessionIdOf(req);
  const existing = sessionId === undefined ? undefined : transports.get(sessionId);
  if (existing !== undefined) {
    await existing.handleRequest(req, res);
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 400, {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: missing or invalid session" },
      id: null,
    });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, {
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error" },
      id: null,
    });
    return;
  }

  const server = createMcpServer(deps);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    if (transport.sessionId !== undefined) transports.delete(transport.sessionId);
    void server.close();
  };

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" },
        id: null,
      });
    }
  }
}

export function createMcpHttpServer(deps: McpServerDeps): Server {
  return createServer((req, res) => {
    void handleRequest(deps, req, res);
  });
}

export { MCP_PATH };
