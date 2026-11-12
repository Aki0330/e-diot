export type Tab = "chat" | "dashboard" | "budget" | "transactions" | "memory" | "profile";

export interface TabMeta {
  readonly id: Tab;
  readonly icon: string;
  /** 中文主标签 */
  readonly label: string;
  /** 等宽英文副标签（导航用） */
  readonly mono: string;
  /** 面包屑分组 */
  readonly group: string;
}

export const TABS: readonly TabMeta[] = [
  { id: "chat", icon: "💬", label: "AI助手", mono: "ASSISTANT", group: "记录" },
  { id: "dashboard", icon: "📊", label: "总览", mono: "OVERVIEW", group: "生活" },
  { id: "budget", icon: "💰", label: "预算", mono: "BUDGET", group: "生活" },
  { id: "transactions", icon: "📝", label: "账单", mono: "LEDGER", group: "生活" },
  { id: "memory", icon: "🧠", label: "记忆", mono: "MEMORY", group: "生活" },
  { id: "profile", icon: "👤", label: "我的", mono: "PROFILE", group: "设置" },
];

const FALLBACK_TAB: TabMeta = {
  id: "chat",
  icon: "💬",
  label: "AI助手",
  mono: "ASSISTANT",
  group: "记录",
};

export function tabMeta(tab: Tab): TabMeta {
  return TABS.find((item) => item.id === tab) ?? FALLBACK_TAB;
}
