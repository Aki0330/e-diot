import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { connectDatabase, insertUser, type DatabaseHandle } from "@cyberbudget/db";
import { generateUserId, parseConfig } from "@cyberbudget/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMcpServer } from "./server.js";

const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = connectionString !== undefined && connectionString !== "";

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] }).content ?? [];
  return content.find((item) => item.type === "text")?.text ?? "";
}

describe.skipIf(!enabled)("MCP 预算工具（集成）", () => {
  let handle: DatabaseHandle;
  const userId = generateUserId({ phoneNum: `136${String(Date.now()).slice(-8)}` });
  const clients: Client[] = [];

  async function connect(defaultUserId?: string): Promise<Client> {
    const server = createMcpServer({
      apiKey: "",
      sleep: () => Promise.resolve(),
      db: handle.db,
      ...(defaultUserId === undefined ? {} : { defaultUserId }),
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "budget-test", version: "0.0.0" });
    await client.connect(clientTransport);
    clients.push(client);
    return client;
  }

  beforeAll(async () => {
    const config = parseConfig(
      {
        JWT_SECRET_KEY: "mcp-budget-test-secret-0123456789",
        DATABASE_URL: connectionString,
        APP_ENV: "test",
        LOG_LEVEL: "silent",
      },
      { repoRoot: process.cwd() },
    );
    handle = connectDatabase(config);
    await insertUser(handle.db, {
      userId,
      username: `mcp-budget-${userId}`,
      phoneNum: `136${String(Date.now()).slice(-8)}`,
      passwordHash: "x",
      monthlyBudget: "0.00",
    });
  });

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.close()));
    await handle.close();
  });

  it("设置总预算与分类预算，并可查询", async () => {
    const client = await connect(userId);
    const saved = await client.callTool({
      name: "set_budget",
      arguments: {
        total_budget: 1000,
        categories: [
          { category: "餐饮", monthly_limit: 400 },
          { category: "交通", monthly_limit: 100 },
        ],
      },
    });
    const savedText = textOf(saved);
    expect(savedText).toContain("✅ 预算已更新");
    expect(savedText).toContain("总预算：¥1000.00");
    expect(savedText).toContain("餐饮：¥400.00");

    const read = await client.callTool({ name: "get_budget", arguments: {} });
    const readText = textOf(read);
    expect(readText).toContain("总预算：¥1000.00");
    expect(readText).toContain("交通：¥100.00");
  });

  it("分类合计超过总预算时不写库", async () => {
    const client = await connect(userId);
    const result = await client.callTool({
      name: "set_budget",
      arguments: {
        categories: [{ category: "购物", monthly_limit: 2000 }],
      },
    });
    const value = textOf(result);
    expect(value).toContain("❌ 预算未更新");
    expect(value).toContain("超出");
  });

  it("未提供 user_id 且无默认用户时给出提示", async () => {
    const client = await connect();
    const result = await client.callTool({
      name: "set_budget",
      arguments: { total_budget: 100 },
    });
    expect(textOf(result)).toContain("user_id");
  });

  it("拒绝超分配时保留之前的总额和全部分类", async () => {
    const client = await connect(userId);
    const before = textOf(await client.callTool({ name: "get_budget", arguments: {} }));
    const rejected = await client.callTool({
      name: "set_budget",
      arguments: { total_budget: 900, categories: [{ category: "超额分类", monthly_limit: 901 }] },
    });
    expect(textOf(rejected)).toContain("❌ 预算未更新");
    expect(textOf(await client.callTool({ name: "get_budget", arguments: {} }))).toBe(before);
  });
});
