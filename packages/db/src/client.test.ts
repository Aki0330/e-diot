import { parseConfig } from "@cyberbudget/shared";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { createPool } from "./client.js";

describe("数据库连接 TLS", () => {
  it.each(["", "?sslmode=disable", "?sslmode=no-verify", "?uselibpqcompat=true&sslmode=require"])(
    "DB_SSL 开启时，即使连接串为 %s 也要求验证证书与主机名",
    async (query) => {
      const config = parseConfig({
        JWT_SECRET_KEY: "test-only",
        DB_SSL: "true",
        DATABASE_URL: `postgresql://db.example/ledger${query}`,
      });
      const pool = createPool(config);
      try {
        const parsed = new Client(pool.options);
        expect(new URL(pool.options.connectionString!).searchParams.get("sslmode")).toBe(
          "verify-full",
        );
        expect(parsed.ssl).toBeTruthy();
        expect(parsed.ssl).not.toHaveProperty("rejectUnauthorized", false);
        expect(parsed.ssl).not.toHaveProperty("checkServerIdentity");
      } finally {
        await pool.end();
      }
    },
  );

  it("保留私有 CA、客户端证书及其它连接选项", async () => {
    const config = parseConfig({
      JWT_SECRET_KEY: "test-only",
      DB_SSL: "true",
      DATABASE_URL:
        "postgresql://db.example/ledger?sslrootcert=ca.pem&sslcert=client.pem&application_name=ledger",
    });
    const pool = createPool(config);
    try {
      const params = new URL(pool.options.connectionString!).searchParams;
      expect(params.get("sslrootcert")).toBe("ca.pem");
      expect(params.get("sslcert")).toBe("client.pem");
      expect(params.get("application_name")).toBe("ledger");
    } finally {
      await pool.end();
    }
  });
});
