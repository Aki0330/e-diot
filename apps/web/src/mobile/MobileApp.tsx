import { useState } from "react";

import { setToken } from "../api/client.js";
import { BudgetPage } from "../pages/BudgetPage.js";
import { ChatPage } from "../pages/ChatPage.js";
import { DashboardPage } from "../pages/DashboardPage.js";
import { MemoryPage } from "../pages/MemoryPage.js";
import { ProfilePage } from "../pages/ProfilePage.js";
import { TransactionsPage } from "../pages/TransactionsPage.js";

export type SecondaryView = "budget" | "memory";

type MobileTab = "chat" | "dashboard" | "transactions" | "profile";

const TABS: readonly { id: MobileTab; icon: string; label: string }[] = [
  { id: "chat", icon: "💬", label: "对话" },
  { id: "dashboard", icon: "📊", label: "总览" },
  { id: "transactions", icon: "📝", label: "账单" },
  { id: "profile", icon: "👤", label: "我的" },
];

/**
 * 移动端专用展示入口（#/m）。
 * 桌面打开时套手机框预览；真机打开则直接全屏。
 * 主 Tab 只保留 4 个，预算与记忆从「我的」进入二级页。
 */
export function MobileApp() {
  const [tab, setTab] = useState<MobileTab>("chat");
  const [secondary, setSecondary] = useState<SecondaryView | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const chatActive = tab === "chat" && secondary === null;

  const logout = (): void => {
    setToken(null);
    window.location.href = "/";
  };

  return (
    <div className="mobile-demo">
      <div className="mobile-frame">
        <div className="mobile-screen">
          <div className="mobile-statusbar">
            <span>9:41</span>
            <span className="ms-brand">e-diot</span>
            <span className="ms-signal">▮▮▮</span>
          </div>

          <div className="mobile-body">
            <div className="mobile-page chat" style={{ display: chatActive ? "flex" : "none" }}>
              <ChatPage
                active={chatActive}
                sidebarCollapsed={false}
                onDataChanged={() => setRefreshKey((value) => value + 1)}
              />
            </div>

            <div
              className="mobile-page"
              style={{ display: tab === "dashboard" ? "block" : "none" }}
            >
              <DashboardPage active={tab === "dashboard"} refreshKey={refreshKey} />
            </div>

            <div
              className="mobile-page"
              style={{ display: tab === "transactions" ? "block" : "none" }}
            >
              <TransactionsPage active={tab === "transactions"} refreshKey={refreshKey} />
            </div>

            <div className="mobile-page" style={{ display: tab === "profile" ? "block" : "none" }}>
              <ProfilePage
                active={tab === "profile" && secondary === null}
                onNavigateSecondary={(view) => setSecondary(view)}
                onLogout={logout}
              />
            </div>

            {secondary !== null && (
              <div className="mobile-subpage">
                <div className="mobile-subhead">
                  <button className="memory-btn" onClick={() => setSecondary(null)}>
                    ← 返回
                  </button>
                  <b>{secondary === "budget" ? "预算管理" : "我的记忆"}</b>
                </div>
                <div className="mobile-page">
                  {secondary === "budget" ? (
                    <BudgetPage active refreshKey={refreshKey} />
                  ) : (
                    <MemoryPage active />
                  )}
                </div>
              </div>
            )}
          </div>

          {secondary === null && (
            <nav className="mobile-tabs">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mobile-tab${tab === item.id ? " active" : ""}`}
                  onClick={() => setTab(item.id)}
                >
                  <span className="mt-icon">{item.icon}</span>
                  <span className="mt-label">{item.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
      <p className="mobile-demo-note">移动端预览 · 真机访问同一地址并加 #/m</p>
    </div>
  );
}
