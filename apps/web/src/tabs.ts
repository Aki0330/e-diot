export type Tab = "chat" | "dashboard" | "budget" | "transactions" | "memory" | "profile";

export const TABS: readonly { id: Tab; label: string }[] = [
  { id: "chat", label: "对话" },
  { id: "dashboard", label: "总览" },
  { id: "budget", label: "预算" },
  { id: "transactions", label: "账单" },
  { id: "memory", label: "记忆" },
  { id: "profile", label: "我的" },
];
