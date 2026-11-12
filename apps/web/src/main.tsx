import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import "./style.css";
import "./theme.css";
import "./pages.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("找不到 #root 挂载点");
}

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
