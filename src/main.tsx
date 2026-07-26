import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/globals.css";

// PWA service-worker registration. The plugin injects the SW at build time;
// we register it from JS so we can log activation and surface offline status.
async function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env.DEV) return; // skip in dev for fast HMR
  // The vite-plugin-pwa emits /sw.js at build time. We register it
  // directly so we don't depend on a virtual module ID.
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (err) {
    console.warn("[Little Loop] SW registration failed:", err);
  }
}

void registerSW();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);