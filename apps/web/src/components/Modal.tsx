import { useState, type ReactNode } from "react";

import { useToast } from "./Toast.js";

export interface ModalProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
  readonly confirmLabel?: string;
}

/** 与旧 `showModal()` 等价：点遮罩关闭、确认按钮异步提交、失败 toast 且不关闭 */
export function Modal({ title, children, onClose, onConfirm, confirmLabel = "确认" }: ModalProps) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <button
          className="btn-primary btn-block"
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "处理中…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}
