import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const LOCAL_CACHE = join(PROJECT_ROOT, ".local-cache");
const HOST = "127.0.0.1";
const PORT = Number(process.env.BREAKFAST_LOCAL_PORT || 4173);
const LOCAL_URL = `http://${HOST}:${PORT}/`;
const MAX_REQUEST_BYTES = 5_900_000;

const ROOT_FILES = new Set(["index.html", "manifest.webmanifest", "service-worker.js", "offline.html"]);
const PUBLIC_DIRECTORIES = new Set([
  "salary_app",
  "accounting",
  "shared",
  "employee_portal",
  "dashboard",
  "dashboard_cost",
  "login"
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function parseEnv(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function loadLocalEnvironment() {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  const values = parseEnv(await readFile(envPath, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

await loadLocalEnvironment();
process.env.BREAKFAST_LOCAL_MODE = "true";

let recognitionHandlerPromise;

async function loadRecognitionHandler() {
  if (!recognitionHandlerPromise) {
    recognitionHandlerPromise = (async () => {
      await mkdir(LOCAL_CACHE, { recursive: true });
      const outputFile = join(LOCAL_CACHE, "recognize-timecard.mjs");
      await build({
        entryPoints: [join(PROJECT_ROOT, "api", "_lib", "timecard-core.ts")],
        outfile: outputFile,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node20",
        packages: "external",
        logLevel: "silent"
      });
      const moduleUrl = new URL(`file:///${outputFile.replace(/\\/g, "/")}?v=${Date.now()}`);
      const module = await import(moduleUrl.href);
      return module.handleTimecardRecognition;
    })();
  }
  return recognitionHandlerPromise;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function handleRecognition(request, response) {
  try {
    const body = await readRequestBody(request);
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else if (value !== undefined) headers.set(name, value);
    }
    const webRequest = new Request(`${LOCAL_URL}api/recognize-timecard`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : body
    });
    const handler = await loadRecognitionHandler();
    const result = await handler(webRequest, { requestId: `local-${randomUUID()}`, localMode: true });
    const resultBody = Buffer.from(await result.arrayBuffer());
    const resultHeaders = {};
    result.headers.forEach((value, name) => {
      if (!["connection", "content-length", "transfer-encoding"].includes(name.toLowerCase())) {
        resultHeaders[name] = value;
      }
    });
    resultHeaders["Content-Length"] = resultBody.length;
    response.writeHead(result.status, resultHeaders);
    response.end(resultBody);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === "REQUEST_TOO_LARGE";
    console.error("本機 AI 端點錯誤：", error);
    sendJson(response, tooLarge ? 413 : 500, {
      error: tooLarge ? "IMAGE_TOO_LARGE" : "LOCAL_SERVER_ERROR",
      message: tooLarge ? "照片資料過大，請縮小後重試。" : "本機 AI 服務暫時無法使用；其餘功能不受影響。"
    });
  }
}

function resolvePublicFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const clean = decoded.replace(/\\/g, "/").replace(/^\/+/, "");
  const relative = clean || "index.html";
  const firstSegment = relative.split("/")[0];
  if (!ROOT_FILES.has(relative) && !PUBLIC_DIRECTORIES.has(firstSegment)) return null;
  let fullPath = resolve(PROJECT_ROOT, normalize(relative));
  if (relative !== "index.html" && (decoded.endsWith("/") || !extname(fullPath))) {
    fullPath = join(fullPath, "index.html");
  }
  if (fullPath !== PROJECT_ROOT && !fullPath.startsWith(`${PROJECT_ROOT}${sep}`)) return null;
  return fullPath;
}

async function serveStatic(request, response, pathname) {
  const filePath = resolvePublicFile(pathname);
  if (!filePath) {
    sendJson(response, 404, { error: "NOT_FOUND", message: "找不到這個本機頁面。" });
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": content.length
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      sendJson(response, 404, { error: "NOT_FOUND", message: "找不到這個本機頁面。" });
      return;
    }
    throw error;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", LOCAL_URL);
    if (url.pathname === "/api/recognize-timecard") {
      await handleRecognition(request, response);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED", message: "本機頁面只接受 GET 請求。" });
      return;
    }
    await serveStatic(request, response, url.pathname);
  } catch (error) {
    console.error("本機伺服器錯誤：", error);
    if (!response.headersSent) sendJson(response, 500, { error: "LOCAL_SERVER_ERROR", message: "本機頁面暫時無法讀取。" });
    else response.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("初一食午完整本機系統已啟動");
  console.log(`網址：${LOCAL_URL}`);
  console.log("資料只存於這個網址使用的瀏覽器，請定期下載完整備份。");
  console.log("關閉本視窗即可停止本機系統。");
  console.log("");

  if (
    !process.argv.includes("--no-open") &&
    process.env.BREAKFAST_NO_OPEN !== "1" &&
    process.platform === "win32"
  ) {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${LOCAL_URL}"`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  }
});

server.on("error", error => {
  if (error && typeof error === "object" && error.code === "EADDRINUSE") {
    console.error(`連接埠 ${PORT} 已在使用中，請先關閉舊的本機系統視窗後再試。`);
    process.exitCode = 1;
    return;
  }
  throw error;
});
