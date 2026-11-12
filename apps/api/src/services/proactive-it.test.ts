import {
  connectDatabase,
  insertTransaction,
  insertUser,
  listMessages,
  listSessions,
  upsertUserSettings,
  type DatabaseHandle,
} from "@cyberbudget/db";
import { generateUserId, parseConfig } from "@cyberbudget/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runProactiveTick, shanghaiNow, submitProactiveFeedback } from "./proactive.js";

const connectionString = process.env["TEST_DATABASE_URL"];
const enabled = connectionString !== undefined && connectionString !== "";

function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

describe.skipIf(!enabled)("主动关怀调度（集成）", () => {
  let handle: DatabaseHandle;
  const userId = generateUserId({ phoneNum: `139${String(Date.now()).slice(-8)}` });
  const quietUserId = generateUserId({ phoneNum: `138${String(Date.now() - 1000).slice(-8)}` });
  const careTime = clock(shanghaiNow(new Date()).minutes);

  beforeAll(async () => {
    const config = parseConfig(
      {
        JWT_SECRET_KEY: "proactive-test-secret-key-0123456789",
        DATABASE_URL: connectionString,
        APP_ENV: "test",
        LOG_LEVEL: "silent",
      },
      { repoRoot: process.cwd() },
    );
    handle = connectDatabase(config);

    await insertUser(handle.db, {
      userId,
      username: `bp-${userId}`,
      phoneNum: `139${String(Date.now()).slice(-8)}`,
      passwordHash: "x",
      monthlyBudget: "100.00",
    });
    await upsertUserSettings(handle.db, userId, {
      careTime,
      quietStart: "00:00",
      quietEnd: "00:00",
      proactiveLevel: "medium",
      persona: "buddy",
    });
    await insertTransaction(handle.db, {
      userId,
      amount: "85.00",
      type: "EXPENSE",
      category: "餐饮",
      transactionTime: new Date(),
    });

    await insertUser(handle.db, {
      userId: quietUserId,
      username: `bq-${quietUserId}`,
      phoneNum: `138${String(Date.now() - 2000).slice(-8)}`,
      passwordHash: "x",
      monthlyBudget: "100.00",
    });
    await upsertUserSettings(handle.db, quietUserId, {
      careTime,
      quietStart: "00:00",
      quietEnd: "23:59",
      proactiveLevel: "medium",
      persona: "buddy",
    });
  });

  afterAll(async () => {
    await handle.close();
  });

  it("到点只发一条，重复 tick 不重复，反馈可暂停", async () => {
    const first = await runProactiveTick(handle.db);
    expect(first.sent).toBe(1);
    expect(first.items[0]?.kind).toBe("budget_near");

    const second = await runProactiveTick(handle.db);
    expect(second.sent).toBe(0);

    const sessions = await listSessions(handle.db, userId);
    expect(sessions.length).toBeGreaterThan(0);
    const messages = await listMessages(handle.db, sessions[0]!.sessionId);
    const proactive = messages.find((message) => message.isProactive);
    expect(proactive).toBeDefined();
    expect(proactive?.content.startsWith("嘿，")).toBe(true);

    const feedback = await submitProactiveFeedback(handle.db, userId, proactive!.messageId, "mute");
    expect(feedback.ok).toBe(true);
    expect(feedback.snoozeUntil).not.toBeNull();
  });
});
