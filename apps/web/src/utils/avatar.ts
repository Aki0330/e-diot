/**
 * 记账搭子形象：只保存在浏览器本地（localStorage），不涉及任何接口。
 * 登录页注册时可以预选，之后在「我的」里随时更换。
 */

export interface AvatarOption {
  readonly id: string;
  readonly emoji: string;
  readonly name: string;
}

export const AVATARS: readonly AvatarOption[] = [
  { id: "fox", emoji: "🦊", name: "小狐" },
  { id: "panda", emoji: "🐼", name: "团子" },
  { id: "cat", emoji: "🐱", name: "咪咪" },
  { id: "penguin", emoji: "🐧", name: "企鹅" },
  { id: "owl", emoji: "🦉", name: "夜猫子" },
  { id: "whale", emoji: "🐳", name: "小鲸" },
];

const STORAGE_KEY = "ediot.avatar";
const CHANGE_EVENT = "ediot:avatar-change";
const FALLBACK = "🦊";

/** 读取当前形象：读不到就用默认值，绝不抛错 */
export function getAvatar(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null && saved !== "") return saved;
  } catch {
    // 隐私模式下 localStorage 可能不可用，静默降级
  }
  return FALLBACK;
}

/** 写入当前形象，并通知其他组件刷新 */
export function setAvatar(emoji: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, emoji);
  } catch {
    // 同上：写不进去也不影响页面使用
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** 订阅形象变更，返回取消订阅函数 */
export function subscribeAvatar(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}
