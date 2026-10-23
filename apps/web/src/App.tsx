import { useCallback, useEffect, useState } from "react";

import { UNAUTHORIZED_EVENT, api, getToken, setToken } from "./api/client.js";
import type { UserProfile } from "./api/types.js";
import { AuthPage } from "./pages/AuthPage.js";
import { BudgetPage } from "./pages/BudgetPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";

type Tab = "chat" | "dashboard" | "budget" | "transactions";

const TABS: readonly { id: Tab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "AI助手" },
  { id: "dashboard", icon: "📊", label: "总览" },
  { id: "budget", icon: "💰", label: "预算" },
  { id: "transactions", icon: "📝", label: "账单" },
];

/**
 * 应用壳：登录态判断 + 顶栏 + 4 个页面 + 底部导航。
 *
 * 与旧实现一致：四个页面的组件始终挂载（用 display 切换），
 * 切 Tab 不会丢失对话历史与已加载的数据。
 */
export function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<Tab>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadUser = useCallback(async (): Promise<void> => {
    if (getToken() === "") {
      setUser(null);
      return;
    }
    try {
      setUser(await api.me());
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadUser();
      setChecking(false);
    })();
  }, [loadUser]);

  useEffect(() => {
    const onUnauthorized = (): void => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = (): void => {
    setToken(null);
    setUser(null);
    setTab("chat");
  };

  if (checking) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  if (user === null) {
    return (
      <AuthPage
        onAuthenticated={async () => {
          await loadUser();
          setTab("chat");
        }}
      />
    );
  }

  return (
    <div id="app" className={`app${tab === "chat" ? " chat-active" : ""}`}>
      <header className="top-bar">
        <div className="top-bar-left">
          <button
            className="btn-toggle-sidebar"
            id="btn-toggle-sidebar"
            title="收起/展开侧栏"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
          <span className="logo-text">💸 CyberBudget</span>
        </div>
        <div className="top-bar-right">
          <span className="header-user">👋 {user.username}</span>
          <button id="btn-logout" className="btn-text" onClick={logout}>
            退出
          </button>
        </div>
      </header>

      <main id="page-container" className={`page-container${tab === "chat" ? " chat-mode" : ""}`}>
        <div className="page-wrapper" style={{ display: tab === "chat" ? "block" : "none" }}>
          <ChatPage
            active={tab === "chat"}
            sidebarCollapsed={sidebarCollapsed}
            onDataChanged={() => setRefreshKey((value) => value + 1)}
          />
        </div>
        <div className="page-wrapper" style={{ display: tab === "dashboard" ? "block" : "none" }}>
          <DashboardPage active={tab === "dashboard"} refreshKey={refreshKey} />
        </div>
        <div className="page-wrapper" style={{ display: tab === "budget" ? "block" : "none" }}>
          <BudgetPage active={tab === "budget"} refreshKey={refreshKey} />
        </div>
        <div
          className="page-wrapper"
          style={{ display: tab === "transactions" ? "block" : "none" }}
        >
          <TransactionsPage active={tab === "transactions"} refreshKey={refreshKey} />
        </div>
      </main>

      <nav className="bottom-nav">
        {TABS.map((item) => (
          <div
            key={item.id}
            className={`nav-item${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  );
}
