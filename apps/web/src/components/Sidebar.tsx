import { useEffect, useState } from "react";

import type { UserProfile } from "../api/types.js";
import { TABS, type Tab } from "../tabs.js";
import { getAvatar, subscribeAvatar } from "../utils/avatar.js";
import { fmt } from "../utils/format.js";

export interface SidebarProps {
  readonly tab: Tab;
  readonly user: UserProfile;
  readonly onNavigate: (tab: Tab) => void;
  readonly onLogout: () => void;
}

/** 导航分组：情绪上「记录」是主线，管理类放一起，设置单独一块 */
const GROUPS: readonly { key: string; mono: string }[] = [
  { key: "记录", mono: "RECORD" },
  { key: "生活", mono: "LIFE" },
  { key: "设置", mono: "SYSTEM" },
];

/** 桌面端左侧导航（移动端由 CSS 隐藏，改用底部 Tab） */
export function Sidebar({ tab, user, onNavigate, onLogout }: SidebarProps) {
  const [avatar, setAvatarState] = useState<string>(() => getAvatar());

  useEffect(() => subscribeAvatar(() => setAvatarState(getAvatar())), []);

  return (
    <aside className="sidebar" aria-label="侧边导航">
      <div className="side-brand">
        <span className="brand-mark">💸</span>
        <div>
          <div className="brand-name">
            e-diot<span className="brand-cn">智账</span>
          </div>
          <div className="brand-sub">YOUR QUIET MONEY BUDDY</div>
        </div>
      </div>

      <nav className="side-nav">
        {GROUPS.map((group) => {
          const items = TABS.filter((item) => item.group === group.key);
          if (items.length === 0) return null;
          return (
            <div className="side-group" key={group.key}>
              <div className="side-nav-label">{group.mono}</div>
              {items.map((item) => (
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
            </div>
          );
        })}
      </nav>

      <div className="side-foot">
        <div className="side-user">
          <div className="side-avatar">{avatar}</div>
          <div className="side-user-info">
            <div className="side-user-name">{user.username}</div>
            <div className="side-user-meta">月预算 ¥{fmt(user.budget)}</div>
          </div>
        </div>
        <button type="button" className="side-logout" onClick={onLogout}>
          退出登录
        </button>
        <a className="side-preview" href="/m">
          📱 手机端预览
        </a>
        <div className="side-legend">
          <span>
            <i className="dot lime" />
            数据已同步
          </span>
        </div>
      </div>
    </aside>
  );
}
