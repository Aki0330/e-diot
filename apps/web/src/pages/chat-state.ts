export interface ChatMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly intentType?: string | null;
  readonly graphPath?: string | null;
  readonly messageId?: number;
  readonly isProactive?: boolean;
}

interface ChatView {
  readonly version: number;
  readonly id: string | null;
  readonly status: "ready" | "loading" | "sending";
  readonly messages: readonly ChatMessage[];
  readonly error: string | null;
}

type ChatAction =
  | { type: "select"; version: number; id: string | null }
  | { type: "history"; version: number; messages: readonly ChatMessage[] }
  | { type: "send"; version: number; content: string }
  | { type: "reply"; version: number; id: string; message: ChatMessage }
  | { type: "failure"; version: number; error: string };

export function emptyChatView(version: number, id: string | null): ChatView {
  return { version, id, status: id === null ? "ready" : "loading", messages: [], error: null };
}

export function chatViewReducer(view: ChatView, action: ChatAction): ChatView {
  if (action.type === "select") return emptyChatView(action.version, action.id);
  if (action.version !== view.version) return view;
  switch (action.type) {
    case "history":
      return { ...view, status: "ready", error: null, messages: action.messages };
    case "send":
      return {
        ...view,
        status: "sending",
        error: null,
        messages: [...view.messages, { role: "user", content: action.content }],
      };
    case "reply":
      return {
        ...view,
        id: action.id,
        status: "ready",
        messages: [...view.messages, action.message],
      };
    case "failure":
      return { ...view, status: "ready", error: action.error };
  }
}

export function submitsChat(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "isComposing" | "keyCode">,
): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}
