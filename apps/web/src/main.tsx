import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { MobileApp } from "./mobile/MobileApp.js";
import { ToastProvider } from "./components/Toast.js";
import "./style.css";
import "./theme.css";
import "./pages.css";
import "./mobile.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("找不到 #root 挂载点");
}

const isMobileEntry = window.location.hash.startsWith("#/m");

createRoot(container).render(
  <StrictMode>
    <ToastProvider>{isMobileEntry ? <MobileApp /> : <App />}</ToastProvider>
  </StrictMode>,
);
