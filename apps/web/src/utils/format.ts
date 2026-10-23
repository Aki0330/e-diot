/** 与旧 `frontend/js/app.js` 末尾的 Utils 一致 */

export const INTENT_LABELS: Record<string, string> = {
  add_transaction: "📝 记账",
  query_budget: "📊 查预算",
  query_transactions: "📋 查账单",
  set_category_budget: "💰 预算分配",
  chat: "💬 闲聊",
};

const CATEGORY_EMOJI: Record<string, string> = {
  餐饮: "🍽️",
  交通: "🚗",
  购物: "🛍️",
  娱乐: "🎬",
  住房: "🏠",
  医疗: "💊",
  教育: "📚",
  工资: "💼",
  分红: "📈",
  其他: "📌",
  全部: "📋",
};

export function catEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? "📌";
}

export function fmt(value: number): string {
  return Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function fmtDate(iso: string): string {
  if (iso === "") return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/** 先转义再支持 `**粗体**` 与 `` `代码` ``，与旧实现一致（无 XSS 风险） */
export function formatContent(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}
