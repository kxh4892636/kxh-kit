import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./providers.tsx";
import { AppRouter } from "./router.tsx";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("缺少 #root 挂载点");

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </StrictMode>,
);
