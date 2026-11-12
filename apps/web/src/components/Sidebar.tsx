import type { UserProfile } from "../api/types.js";
import { TABS, type Tab } from "../tabs.js";
import { fmt } from "../utils/format.js";

export interface SidebarProps {
  readonly tab: Tab;
  readonly user: UserProfile;
  readonly onNavigate: (tab: Tab) => void;
  readonly onLogout: () => void;
}

/** 桌面端左侧导航（移动端由 CSS 隐藏，改用底部 Tab） */
export function Sidebar({ tab, user, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="侧边导航">
      <div className="side-brand">
        <span className="brand-mark">💸</span>
        <div>
          <div className="brand-name">
            CyberBudget<span className="brand-cn">智账</span>
          </div>
          <div className="brand-sub">RECORDING YOUR LIVES</div>
        </div>
      </div>

      <nav className="side-nav">
        <div className="side-nav-label">CYBERBUDGET</div>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`side-item${tab === item.id ? " active" : ""}`}
            onClick={() => onNavigate(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <span className="side-icon">{item.icon}</span>
            <span className="side-main">
              <span className="side-label">{item.label}</span>
              <span className="side-mono">{item.mono}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="side-foot">
        <div className="side-user">
          <div className="side-avatar">{user.username.slice(0, 1).toUpperCase()}</div>
          <div>
            <div className="side-user-name">{user.username}</div>
            <div className="side-user-meta">MONTHLY · ¥{fmt(user.budget)}</div>
          </div>
        </div>
        <button type="button" className="side-logout" onClick={onLogout}>
          退出登录
        </button>
        <div className="side-legend">
          <span>
            <i className="dot lime" />
            在线 · 数据已连接
          </span>
          <span>
            <i className="dot demo" />
            CyberBudget v1.0
          </span>
        </div>
      </div>
    </aside>
  );
}
