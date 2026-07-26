// Smoke test: spawn the production preview server, hit the index, manifest,
// service worker, and assets, then tear down. Verifies the production
// build is servable and the PWA artifacts are reachable.
//
// Usage: npm run smoke
// Requires `npm run build` to have run first.

import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import http from "node:http";

const PORT = Number(process.env.SMOKE_PORT ?? 4174);
const HOST = "127.0.0.1";

const checks = [
  { path: "/", expectType: "text/html", mustContain: "<div id=\"root\">" },
  { path: "/manifest.webmanifest", expectType: "application/manifest+json", mustContain: "\"name\":\"Little Loop\"" },
  { path: "/sw.js", expectType: "text/javascript", mustContain: "workbox" },
  { path: "/icons/icon-192.png", expectType: "image/png" },
  { path: "/icons/icon-512.png", expectType: "image/png" },
];

function fetchPath(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: HOST, port: PORT, path },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            type: res.headers["content-type"] ?? "",
            body,
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("timeout")));
  });
}

async function main() {
  console.log(`[smoke] starting preview server on ${HOST}:${PORT}`);
  const child = spawn(
    process.execPath,
    ["./node_modules/vite/bin/vite.js", "preview", "--host", HOST, "--port", String(PORT)],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  let serverReady = false;
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  // Wait up to 10s for the server to accept connections.
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    try {
      await fetchPath("/");
      serverReady = true;
      break;
    } catch {
      await wait(200);
    }
  }
  if (!serverReady) {
    child.kill();
    throw new Error("[smoke] preview server did not become ready in 10s");
  }
  await wait(200);

  let failed = 0;
  for (const c of checks) {
    try {
      const res = await fetchPath(c.path);
      const ok =
        res.status === 200 &&
        (!c.expectType || res.type.startsWith(c.expectType.split(";")[0])) &&
        (!c.mustContain || res.body.includes(c.mustContain));
      if (ok) {
        console.log(
          `[smoke] PASS  ${c.path}  (${res.status} ${res.type}, ${res.body.length} bytes)`,
        );
      } else {
        failed += 1;
        console.log(
          `[smoke] FAIL  ${c.path}  (${res.status} ${res.type}, body=${res.body.slice(0, 80)})`,
        );
      }
    } catch (err) {
      failed += 1;
      console.log(`[smoke] FAIL  ${c.path}  (${(err).message})`);
    }
  }

  child.kill("SIGTERM");

  if (failed > 0) {
    console.error(`[smoke] ${failed} check(s) failed`);
    process.exit(1);
  } else {
    console.log("[smoke] all checks passed");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("[smoke] error:", err);
  process.exit(1);
});