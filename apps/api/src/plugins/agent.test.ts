import { parseConfig, type AppConfig } from "@cyberbudget/shared";
import { describe, expect, it } from "vitest";

import { pickLlmSettings } from "./agent.js";

const config: AppConfig = parseConfig(
  {
    JWT_SECRET_KEY: "unit-test-secret-key-0123456789abcdef",
    LLM_BASE_URL: "https://global.example.com/v1",
    LLM_API_KEY: "global-key",
    LLM_MODEL: "global-model",
  },
  { repoRoot: process.cwd() },
);

describe("pickLlmSettings", () => {
  it("没有用户配置时使用全局配置", () => {
    expect(pickLlmSettings(config, null)).toEqual({
      baseUrl: "https://global.example.com/v1",
      apiKey: "global-key",
      model: "global-model",
    });
  });

  it("用户 base_url 与 key 都存在时优先使用用户配置", () => {
    expect(
      pickLlmSettings(config, {
        llmBaseUrl: "https://user.example.com/v1",
        llmApiKey: "user-key",
      }),
    ).toEqual({
      baseUrl: "https://user.example.com/v1",
      apiKey: "user-key",
      model: "global-model",
    });
  });

  it("只配置 base_url 时回落到全局", () => {
    expect(
      pickLlmSettings(config, { llmBaseUrl: "https://user.example.com/v1", llmApiKey: null }),
    ).toEqual({
      baseUrl: "https://global.example.com/v1",
      apiKey: "global-key",
      model: "global-model",
    });
  });

  it("只配置 key 时回落到全局", () => {
    expect(pickLlmSettings(config, { llmBaseUrl: null, llmApiKey: "user-key" })).toEqual({
      baseUrl: "https://global.example.com/v1",
      apiKey: "global-key",
      model: "global-model",
    });
  });

  it("空白值视为未配置", () => {
    expect(pickLlmSettings(config, { llmBaseUrl: "   ", llmApiKey: "\t" })).toEqual({
      baseUrl: "https://global.example.com/v1",
      apiKey: "global-key",
      model: "global-model",
    });
  });
});
