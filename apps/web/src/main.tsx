import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { ToastProvider } from "./components/Toast.js";
import { MobileApp } from "./mobile/MobileApp.js";
import "./style.css";
import "./theme.css";
import "./pages.css";
import "./mobile.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("找不到 #root 挂载点");
}

function isMobileEntry(): boolean {
  const { pathname, hash } = window.location;
  return pathname === "/m" || pathname === "/m/" || hash.startsWith("#/m");
}

function Root() {
  const [mobile, setMobile] = useState(isMobileEntry);

  useEffect(() => {
    const onChange = (): void => setMobile(isMobileEntry());
    window.addEventListener("hashchange", onChange);
    window.addEventListener("popstate", onChange);
    return () => {
      window.removeEventListener("hashchange", onChange);
      window.removeEventListener("popstate", onChange);
    };
  }, []);

  return mobile ? <MobileApp /> : <App />;
}

createRoot(container).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>,
);
