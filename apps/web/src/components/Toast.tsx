import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastType = "" | "success" | "error";
type ShowToast = (message: string, type?: ToastType) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

export function useToast(): ShowToast {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback<ShowToast>((message, type = "") => {
    window.clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-atomic="true">
        <div id="toast" className={`toast ${toast?.type ?? ""}${toast === null ? " hidden" : ""}`}>
          {toast?.message}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
