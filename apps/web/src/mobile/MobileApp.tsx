import { useState } from "react";

import { Topbar } from "../components/Topbar.js";
import { BudgetPage } from "../pages/BudgetPage.js";
import { ChatPage } from "../pages/ChatPage.js";
import { DashboardPage } from "../pages/DashboardPage.js";
import { MemoryPage } from "../pages/MemoryPage.js";
import { ProfilePage } from "../pages/ProfilePage.js";
import { TransactionsPage } from "../pages/TransactionsPage.js";
import { TABS } from "../tabs.js";

export type SecondaryView = "budget" | "memory";

type MobileTab = "chat" | "dashboard" | "transactions" | "profile";

const MOBILE_TABS = TABS.filter(
  (item): item is { id: MobileTab; label: string } => item.id !== "budget" && item.id !== "memory",
);

/**
 * 移动端专用展示入口（#/m）。
 * 桌面打开时套手机框预览；真机打开则直接全屏。
 * 主 Tab 只保留 4 个，预算与记忆从「我的」进入二级页。
 */
export function MobileApp({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<MobileTab>("chat");
  const [secondary, setSecondary] = useState<SecondaryView | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const chatActive = tab === "chat" && secondary === null;

  return (
    <div className="mobile-demo">
      <div className="mobile-frame">
        <div className="mobile-screen">
          <Topbar onLogout={tab === "profile" && secondary === null ? onLogout : undefined} />

          <main className="mobile-body">
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

            <div
              className="mobile-page"
              style={{ display: tab === "profile" && secondary === null ? "block" : "none" }}
            >
              <ProfilePage
                active={tab === "profile" && secondary === null}
                onNavigateSecondary={(view) => setSecondary(view)}
              />
            </div>

            {secondary !== null && (
              <div className="mobile-subpage">
                <div className="mobile-subhead">
                  <button
                    type="button"
                    className="memory-btn"
                    aria-label="返回我的"
                    onClick={() => setSecondary(null)}
                  >
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
          </main>

          {secondary === null && (
            <nav className="mobile-tabs" aria-label="主导航">
              {MOBILE_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="mobile-tab"
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <span className={`ledger-icon icon-${item.id}`} aria-hidden="true" />
                  <span className="mt-label">{item.label}</span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>
      <a className="mobile-demo-note" href="/">
        返回桌面版
      </a>
    </div>
  );
}
