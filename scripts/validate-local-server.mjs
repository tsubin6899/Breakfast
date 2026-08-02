import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PORT = 4187;
const server = spawn(process.execPath, ["scripts/local-server.mjs", "--no-open"], {
  cwd: ROOT,
  env: { ...process.env, BREAKFAST_LOCAL_PORT: String(PORT), BREAKFAST_NO_OPEN: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", chunk => { output += chunk.toString(); });
server.stderr.on("data", chunk => { output += chunk.toString(); });

async function waitUntilReady() {
  const started = Date.now();
  while (!output.includes("完整本機系統已啟動")) {
    if (server.exitCode !== null) throw new Error(`本機伺服器提早結束：${output}`);
    if (Date.now() - started > 5000) throw new Error(`本機伺服器啟動逾時：${output}`);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
  }
}

const paths = [
  "/",
  "/salary_app/",
  "/salary_app/data/salary-history-2022-2025.js",
  "/salary_app/special-overtime-rules.js",
  "/accounting/",
  "/accounting/data/revenue-history-2022-2025.js",
  "/accounting/data/revenue-history-2026.js",
  "/accounting/data/accounting-backup-2026-07-22.js",
  "/accounting/data/uber-statement-2026-07-24.js",
  "/accounting/backup-importer.js",
  "/accounting/uber-statement-importer.js",
  "/accounting/foodpanda-statement-importer.js",
  "/accounting/vendor/sql-wasm.js",
  "/accounting/vendor/sql-wasm.wasm",
  "/shared/operations-brandbar.css",
  "/dashboard_cost/"
];

try {
  await waitUntilReady();
  for (const path of paths) {
    const response = await fetch(`http://127.0.0.1:${PORT}${path}`);
    if (!response.ok) throw new Error(`${path} 回傳 HTTP ${response.status}`);
    console.log(`${response.status} ${path}`);
  }
} finally {
  server.kill();
  await Promise.race([
    new Promise(resolvePromise => server.once("exit", resolvePromise)),
    new Promise(resolvePromise => setTimeout(resolvePromise, 1500))
  ]);
}
