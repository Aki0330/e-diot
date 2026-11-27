import { useEffect, useState, useSyncExternalStore } from "react";

import { ApiError, api, currentSession, logoutSession, subscribeSession } from "./api/client.js";
import type { UserProfile } from "./api/types.js";
import { Sidebar } from "./components/Sidebar.js";
import { Topbar } from "./components/Topbar.js";
import { MobileApp } from "./mobile/MobileApp.js";
import { AuthPage } from "./pages/AuthPage.js";
import { BudgetPage } from "./pages/BudgetPage.js";
import { ChatPage } from "./pages/ChatPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { MemoryPage } from "./pages/MemoryPage.js";
import { ProfilePage } from "./pages/ProfilePage.js";
import { TransactionsPage } from "./pages/TransactionsPage.js";
import { TABS, type Tab } from "./tabs.js";

/**
 * 应用壳：登录态判断 + 桌面侧栏/顶栏 + 移动端顶栏/底部导航 + 5 个页面。
 *
 * 与旧实现一致：页面组件始终挂载（用 display 切换），切 Tab 不会丢失对话历史与已加载的数据。
 * 桌面（≥1024px）显示左侧栏，移动端沿用底部 Tab。
 */
function isMobileEntry(): boolean {
  const { pathname, hash } = window.location;
  return pathname === "/m" || pathname === "/m/" || hash.startsWith("#/m");
}

export function App() {
  const [mobile, setMobile] = useState(isMobileEntry);
  useEffect(() => {
    const onChange = (): void => setMobile(isMobileEntry());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);
  const session = useSyncExternalStore(subscribeSession, currentSession, currentSession);
  if (session === null) return <AuthPage />;
  return <AuthenticatedApp key={session} session={session} mobile={mobile} />;
}

function AuthenticatedApp({ mobile, session }: { mobile: boolean; session: string }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api.me().then(
      (profile) => {
        if (active) setUser(profile);
      },
      (cause: unknown) => {
        if (!active) return;
        if (
          cause instanceof ApiError &&
          (cause.code === "AUTH_USER_DISABLED" || cause.code === "AUTH_USER_NOT_FOUND")
        ) {
          logoutSession(session);
          return;
        }
        setError(cause instanceof Error ? cause.message : "账户信息加载失败");
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, session]);

  const logout = (): void => logoutSession(session);
  if (user === null) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
        }}
      >
        {error === null ? (
          <div className="spinner" />
        ) : (
          <div role="alert" className="empty">
            <p>{error}</p>
            <button
              className="btn-primary"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              重试
            </button>
            <button className="btn-text" onClick={logout}>
              退出登录
            </button>
          </div>
        )}
      </div>
    );
  }

  return mobile ? <MobileApp onLogout={logout} /> : <DesktopApp user={user} logout={logout} />;
}

function DesktopApp({ user, logout }: { user: UserProfile; logout: () => void }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div id="app" className={`app${tab === "chat" ? " chat-active" : ""}`}>
      <Sidebar tab={tab} user={user} onNavigate={setTab} onLogout={logout} />

      <div className="app-main">
        <Topbar onLogout={logout} />

        <main id="page-container" className={`page-container${tab === "chat" ? " chat-mode" : ""}`}>
          <div className="page-wrapper" style={{ display: tab === "chat" ? "block" : "none" }}>
            <ChatPage
              active={tab === "chat"}
              sidebarCollapsed={false}
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
          <div className="page-wrapper" style={{ display: tab === "profile" ? "block" : "none" }}>
            <ProfilePage active={tab === "profile"} />
          </div>
          <div className="page-wrapper" style={{ display: tab === "memory" ? "block" : "none" }}>
            <MemoryPage active={tab === "memory"} />
          </div>
        </main>

        <nav className="bottom-nav" aria-label="主导航">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-item"
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <span className={`ledger-icon icon-${item.id}`} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
