import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/globals.css";

// V2.0 engine bootstrap. Constructed synchronously on Day 1 so the
// singleton is available before any React component renders. Provider
// implementations are stubs on Day 1 — concrete deps land on Days 4
// (IAP), 6 (ads), 10 (camera roll), 11 (share).
//
// The engine.init() call is fire-and-forget: the V1 routes don't
// touch the engine yet, so the UI does not need to wait on it. By
// the time Day 3 wires `useSubjects` into the home screen, init() will
// have already resolved (it's a no-op until Day 2 lands the migration).
import { Engine, setEngine } from "./engine";
import {
  createAdProvider,
  createIapProvider,
  createPlatform,
} from "./engine/providers";

const engine = new Engine({
  iap: createIapProvider(),
  platform: createPlatform(),
  ads: createAdProvider(),
});
setEngine(engine);
// Fire-and-forget — Day 1 has no async init work. Day 2 turns this
// into the migration call.
void engine.init().catch((err: unknown) => {
  console.error("[little-loop] engine.init() failed:", err);
});

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
