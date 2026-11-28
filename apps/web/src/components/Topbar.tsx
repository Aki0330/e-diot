import type { UserProfile } from "../api/types.js";
import { tabMeta, type Tab } from "../tabs.js";

export interface TopbarProps {
  readonly tab: Tab;
  readonly user: UserProfile;
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
  readonly onLogout: () => void;
}

function todayLabel(): string {
  const now = new Date();
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()] ?? "";
  return `${now.getMonth() + 1} 月 ${now.getDate()} 日 ${week}`;
}

/** 顶栏：移动端显示品牌 + 退出，桌面端显示当前页与今日日期 */
export function Topbar({ tab, user, sidebarCollapsed, onToggleSidebar, onLogout }: TopbarProps) {
  const meta = tabMeta(tab);
  const chatActive = tab === "chat";

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        {chatActive && (
          <button
            className="btn-toggle-sidebar"
            id="btn-toggle-sidebar"
            title="收起/展开侧栏"
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? "▶" : "◀"}
          </button>
        )}
        <span className="mobile-brand">
          <span className="logo-text">💸 e-diot</span>
        </span>
        <div className="crumb">
          <b>{meta.label}</b>
          <span className="crumb-sep">/</span>
          <span className="crumb-page">{meta.mono}</span>
        </div>
      </div>

      <div className="top-bar-right">
        <span className="period">{todayLabel()}</span>
        <span className="sync-pill">
          <i className={`dot ${user.is_active ? "lime" : "dim"}`} />
          {user.is_active ? "已同步" : "离线"}
        </span>
        <button id="btn-logout" className="btn-text" onClick={onLogout}>
          退出
        </button>
      </div>
    </header>
  );
}
