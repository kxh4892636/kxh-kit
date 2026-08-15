import React from "react";
import ReactDOM from "react-dom/client";
import { HotkeysProvider } from "react-hotkeys-hook";

// Electron 环境接管 /api/* 网络调用, 非 Electron (纯浏览器) 为 no-op
import { installApiBridge } from "../api-bridge/install-api-bridge";

import App from "./App";
import "./styles/global.css";

installApiBridge();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <HotkeysProvider initiallyActiveScopes={["navigation"]}>
      <App />
    </HotkeysProvider>
  </React.StrictMode>,
);
