import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./providers";
import "./styles.css";

const appElement = document.getElementById("app");
if (!appElement) {
  throw new Error("missing #app root element");
}

createRoot(appElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
