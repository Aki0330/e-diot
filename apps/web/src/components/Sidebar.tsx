import type { UserProfile } from "../api/types.js";
import { TABS, type Tab } from "../tabs.js";
import { ledgerAmount } from "../utils/ledger.js";
import { LedgerBrand } from "./Topbar.js";

export interface SidebarProps {
  readonly tab: Tab;
  readonly user: UserProfile;
  readonly onNavigate: (tab: Tab) => void;
  readonly onLogout: () => void;
}

export function Sidebar({ tab, user, onNavigate, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <LedgerBrand />

      <nav className="side-nav" aria-label="主导航">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="side-item"
            onClick={() => onNavigate(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <span className={`ledger-icon icon-${item.id}`} aria-hidden="true" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="side-foot">
        <a className="side-preview" href="/m">
          移动端预览 <span aria-hidden="true">↗</span>
        </a>
        <div className="side-user">
          <span className="side-avatar" aria-hidden="true">
            {Array.from(user.username)[0]}
          </span>
          <div className="side-account">
            <div className="side-user-name" title={user.username}>
              {user.username}
            </div>
            <div className="side-budget">月预算 ¥{ledgerAmount(user.budget)}</div>
          </div>
          <button type="button" className="side-logout" aria-label="退出登录" onClick={onLogout}>
            退出
          </button>
        </div>
      </div>
    </aside>
  );
}
