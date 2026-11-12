import type { UserProfile } from "../api/types.js";
import { tabMeta, type Tab } from "../tabs.js";

export interface TopbarProps {
  readonly tab: Tab;
  readonly user: UserProfile;
  readonly sidebarCollapsed: boolean;
  readonly onToggleSidebar: () => void;
  readonly onLogout: () => void;
}

/** 顶栏：移动端显示品牌 + 退出，桌面端显示面包屑与在线状态 */
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
          <span>E-DIOT</span>
          <span className="crumb-sep">/</span>
          <b>{meta.group}</b>
          <span className="crumb-sep">/</span>
          <span className="crumb-page">{meta.mono}</span>
        </div>
      </div>

      <div className="top-bar-right">
        <span className="period">
          <i className={`dot ${user.is_active ? "lime" : "dim"}`} />
          {user.is_active ? "ONLINE" : "OFFLINE"}
        </span>
        <span className="header-user">👋 {user.username}</span>
        <button id="btn-logout" className="btn-text" onClick={onLogout}>
          退出
        </button>
      </div>
    </header>
  );
}
