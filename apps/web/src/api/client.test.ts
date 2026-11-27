import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const expired = () => Response.json({ detail: "已过期" }, { status: 401 });
const renewed = () => Response.json({ access_token: "new-access", refresh_token: "new-refresh" });

describe("Web 登录会话", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      get length() {
        return values.size;
      },
      key: (index: number) => [...values.keys()][index] ?? null,
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", new EventTarget());
    vi.resetModules();
  });

  afterEach(() => vi.unstubAllGlobals());

  it("错开返回的两个 401 复用已换发的令牌", async () => {
    const { api, setTokens } = await import("./client.js");
    setTokens("old-access", "old-refresh");
    const delayed = deferred<Response>();
    let refreshes = 0;
    const fetcher = vi.fn((path: string, options: RequestInit) => {
      if (path.endsWith("/auth/refresh")) {
        refreshes++;
        return renewed();
      }
      if (new Headers(options.headers).get("Authorization") === "Bearer old-access") {
        return path.endsWith("/users/me") ? expired() : delayed.promise;
      }
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetcher);
    const first = api.me();
    const second = api.dashboard();
    await first;
    delayed.resolve(expired());
    await expect(second).resolves.toEqual({ ok: true });
    expect(refreshes).toBe(1);
  });

  it("并发的 401 等待同一次刷新，两个请求都用新令牌成功", async () => {
    const { api, setTokens } = await import("./client.js");
    setTokens("old-access", "old-refresh");
    const started = deferred<void>();
    const refresh = deferred<Response>();
    let refreshes = 0;
    vi.stubGlobal("fetch", (path: string, options: RequestInit) => {
      if (path.endsWith("/auth/refresh")) {
        refreshes++;
        started.resolve();
        return refresh.promise.then((result) => result.clone());
      }
      const token = new Headers(options.headers).get("Authorization");
      return Promise.resolve(
        token === "Bearer new-access" ? Response.json({ ok: true }) : expired(),
      );
    });
    const pending = Promise.all([api.me(), api.settings()]);
    await started.promise;
    await new Promise<void>((done) => setTimeout(done, 0));
    refresh.resolve(renewed());
    await expect(pending).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });

  it.each(["/", "/m", "/#/m"])("未登录的入口 %s 显示登录表单", async (path) => {
    Object.assign(window, { location: new URL(path, "http://localhost") });
    const { renderToStaticMarkup } = await import("react-dom/server");
    vi.stubGlobal("document", { getElementById: (id: string) => (id === "root" ? {} : null) });
    const render = vi.fn<(tree: ReactNode) => void>();
    vi.doMock("react-dom/client", () => ({ createRoot: () => ({ render }) }));
    try {
      await import("../main.js");
      expect(render).toHaveBeenCalledTimes(1);
      const markup = renderToStaticMarkup(render.mock.calls[0]![0]);
      expect(markup).toContain('id="login-form"');
      expect(markup).not.toContain("AI 助手");
    } finally {
      vi.doUnmock("react-dom/client");
    }
  });

  it("临时故障保留凭据并报告刷新接口的错误", async () => {
    const { api, setTokens, getToken } = await import("./client.js");
    setTokens("old-access", "old-refresh");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(
          Response.json({ detail: "暂不可用", code: "UNAVAILABLE" }, { status: 503 }),
        ),
    );
    await expect(api.me()).rejects.toMatchObject({
      status: 503,
      message: "暂不可用",
      code: "UNAVAILABLE",
    });
    expect(getToken()).toBe("old-access");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(renewed())
        .mockResolvedValueOnce(Response.json({ ok: true })),
    );
    await expect(api.me()).resolves.toEqual({ ok: true });
  });

  it("退出后晚到的刷新结果不会恢复旧会话", async () => {
    const { api, setTokens, setToken, getToken } = await import("./client.js");
    setTokens("old-access", "old-refresh");
    const started = deferred<void>();
    const refresh = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockImplementationOnce(() => {
          started.resolve();
          return refresh.promise;
        })
        .mockResolvedValue(Response.json({})),
    );
    const pending = api.me();
    await started.promise;
    setToken(null);
    refresh.resolve(renewed());
    await expect(pending).rejects.toThrow();
    expect(getToken()).toBe("");
  });

  it("刷新响应缺少有效令牌时保留原会话", async () => {
    const client = await import("./client.js");
    client.setTokens("original", "original-refresh");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(Response.json({ access_token: 1, refresh_token: "unexpected" })),
    );
    await expect(client.api.me()).rejects.toThrow("刷新响应缺少令牌");
    expect(client.getToken()).toBe("original");
  });

  it("换号后丢弃旧请求的响应，保留新会话", async () => {
    const { api, setTokens, getToken } = await import("./client.js");
    setTokens("first", "first-refresh");
    const pendingResponse = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(pendingResponse.promise)
      .mockResolvedValue(expired());
    vi.stubGlobal("fetch", fetcher);
    const pending = api.setBudget(42);
    setTokens("second", "second-refresh");
    pendingResponse.resolve(expired());
    await expect(pending).rejects.toThrow();
    expect(getToken()).toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("其他标签页退出后，旧标签页不能刷新", async () => {
    const { api, setTokens } = await import("./client.js");
    setTokens("old-access", "old-refresh");
    const response = deferred<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(response.promise).mockResolvedValue(renewed());
    vi.stubGlobal("fetch", fetcher);
    const pending = api.me();
    vi.resetModules();
    const otherTab = await import("./client.js");
    otherTab.setToken(null);
    response.resolve(expired());
    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("cb_token")).toBeNull();
  });

  it("其他标签页重新登录后，界面订阅者收到新会话标识", async () => {
    const client = await import("./client.js");
    client.setTokens("original", "original-refresh");
    const previous = client.currentSession();
    const listener = vi.fn();
    const unsubscribe = client.subscribeSession(listener);
    const firstWindow = window;
    try {
      vi.stubGlobal("window", new EventTarget());
      vi.resetModules();
      const otherTab = await import("./client.js");
      otherTab.setTokens("second", "second-refresh");
      vi.stubGlobal("window", firstWindow);
      window.dispatchEvent(new Event("storage"));
      expect(client.currentSession()).not.toBe(previous);
      expect(client.currentSession()).toBe(otherTab.currentSession());
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("读取会话凭据期间换号，预算请求不会借用新账号令牌", async () => {
    const client = await import("./client.js");
    client.setTokens("first", "first-refresh");
    vi.resetModules();
    const other = await import("./client.js");
    let changed = false;
    const read = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      const value = read(key);
      if (!changed && key === "cb_session") {
        changed = true;
        other.setTokens("second", "second-refresh");
      }
      return value;
    });
    const sent: (string | null)[] = [];
    vi.stubGlobal("fetch", (_path: string, init: RequestInit) => {
      sent.push(new Headers(init.headers).get("Authorization"));
      return Promise.resolve(Response.json({}));
    });
    await expect(client.api.setBudget(42)).rejects.toThrow();
    expect(changed).toBe(true);
    expect(sent).not.toContain("Bearer second");
    expect(other.getToken()).toBe("second");
  });

  it.each(["注销", "换号"])("刷新写入时另一标签页%s，迟到令牌不会生效或留存", async (action) => {
    const client = await import("./client.js");
    client.setTokens("first", "first-refresh");
    vi.resetModules();
    const other = await import("./client.js");
    let changed = false;
    const write = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => {
      if (!changed && value.includes("new-access")) {
        changed = true;
        if (action === "注销") other.setToken(null);
        else other.setTokens("second", "second-refresh");
      }
      write(key, value);
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(renewed())
        .mockResolvedValue(Response.json({})),
    );
    await expect(client.api.me()).rejects.toThrow();
    expect(changed).toBe(true);
    expect(other.getToken()).toBe(action === "注销" ? "" : "second");
    for (let i = 0; i < localStorage.length; i++) {
      expect(localStorage.getItem(localStorage.key(i)!) ?? "").not.toContain("new-access");
    }
  });

  it("旧版双令牌会话换发后可刷新页面，退出后清除旧格式凭据", async () => {
    localStorage.setItem("cb_token", "legacy-access");
    localStorage.setItem("cb_refresh", "legacy-refresh");
    const client = await import("./client.js");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(renewed())
        .mockResolvedValueOnce(Response.json({ ok: true })),
    );
    await expect(client.api.me()).resolves.toEqual({ ok: true });
    vi.resetModules();
    const reloaded = await import("./client.js");
    expect(reloaded.getToken()).toBe("new-access");
    reloaded.setToken(null);
    expect(reloaded.getToken()).toBe("");
    expect(localStorage.getItem("cb_token")).toBeNull();
    expect(localStorage.getItem("cb_refresh")).toBeNull();
  });

  it("刷新凭据失效时自动退出，旧版单 access token 仍可使用", async () => {
    localStorage.setItem("cb_token", "legacy-access");
    const { api, setTokens, getToken } = await import("./client.js");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ user_id: "legacy" }))
        .mockResolvedValueOnce(expired())
        .mockResolvedValueOnce(expired()),
    );
    await expect(api.me()).resolves.toEqual({ user_id: "legacy" });
    setTokens("old-access", "old-refresh");
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(getToken()).toBe("");
  });
});
