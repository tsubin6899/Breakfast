import { gunzipSync, gzipSync } from "node:zlib";
import { BlobPreconditionFailedError } from "@vercel/blob";
import { getSession } from "./_lib/auth.js";
import { readJson, writeImmutableJson, writeJson } from "./_lib/blob-store.js";
import { isSameOrigin, json } from "./_lib/http.js";

type OperationsState = {
  version: number;
  transactions: unknown[];
  dayLabor?: unknown[];
  auditLog?: unknown[];
  [key: string]: unknown;
};

type CloudDocument = {
  schemaVersion: 1;
  revision: string;
  updatedAt: string;
  updatedBy: string;
  state: OperationsState;
};

const CURRENT_PATH = "breakfast/state/accounting-current.json";
const MAX_COMPRESSED_BYTES = 4_000_000;
const MAX_JSON_BYTES = 24_000_000;

function isOperationsState(value: unknown): value is OperationsState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<OperationsState>;
  return Number.isFinite(Number(state.version)) && Array.isArray(state.transactions);
}

function isConflict(error: unknown) {
  if (error instanceof BlobPreconditionFailedError) return true;
  const item = error as { status?: number; statusCode?: number; name?: string; code?: string; message?: string };
  const message = String(item?.message || "").toLowerCase();
  return item?.status === 409 || item?.statusCode === 409 ||
    item?.name === "BlobPreconditionFailedError" || item?.name === "BlobAlreadyExistsError" ||
    item?.code === "precondition_failed" ||
    (message.includes("precondition failed") && message.includes("etag mismatch"));
}

async function readPayload(request: Request) {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_COMPRESSED_BYTES) throw new Error("COMPRESSED_STATE_TOO_LARGE");
  const isGzip = raw[0] === 0x1f && raw[1] === 0x8b;
  const decoded = isGzip
    ? gunzipSync(raw)
    : raw;
  if (decoded.byteLength > MAX_JSON_BYTES) throw new Error("STATE_TOO_LARGE");
  return JSON.parse(new TextDecoder().decode(decoded)) as {
    state?: unknown;
    baseRevision?: unknown;
    force?: unknown;
  };
}

export default {
  async fetch(request: Request) {
    const user = await getSession(request);
    if (!user) return json({ error: "UNAUTHORIZED", message: "請先登入後再使用雲端記帳資料。" }, 401);
    const saved = await readJson<CloudDocument>(CURRENT_PATH);

    if (request.method === "GET") {
      const body = saved ? {
        state: saved.value.state,
        revision: saved.value.revision,
        updatedAt: saved.value.updatedAt,
        updatedBy: saved.value.updatedBy,
        user
      } : { state: null, revision: "", updatedAt: "", updatedBy: "", user };
      const compressed = gzipSync(JSON.stringify(body));
      return new Response(compressed, { headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "application/json; charset=utf-8",
        "Content-Encoding": "gzip",
        "X-Content-Type-Options": "nosniff"
      } });
    }
    if (request.method !== "PUT") return json({ error: "METHOD_NOT_ALLOWED", message: "僅支援 GET 與 PUT。" }, 405);
    if (!isSameOrigin(request)) return json({ error: "INVALID_ORIGIN", message: "無法確認資料寫入來源。" }, 403);

    let payload: { state?: unknown; baseRevision?: unknown; force?: unknown };
    try {
      payload = await readPayload(request);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_JSON";
      const tooLarge = code.includes("TOO_LARGE");
      return json({ error: tooLarge ? "STATE_TOO_LARGE" : "INVALID_JSON", message: tooLarge ? "記帳資料超過雲端同步上限。" : "無法讀取記帳資料。" }, tooLarge ? 413 : 400);
    }
    if (!isOperationsState(payload.state)) return json({ error: "INVALID_STATE", message: "記帳資料格式不完整。" }, 400);
    const force = payload.force === true;
    if (force && user.role !== "owner") return json({ error: "FORBIDDEN", message: "只有擁有者可以用本機資料覆蓋雲端。" }, 403);
    if (!force && String(payload.baseRevision || "") !== (saved?.value.revision || "")) {
      return json({
        error: "REVISION_CONFLICT",
        message: "雲端資料已有較新的版本，請先選擇要採用雲端或本機資料。",
        revision: saved?.value.revision || "",
        updatedAt: saved?.value.updatedAt || "",
        updatedBy: saved?.value.updatedBy || ""
      }, 409);
    }

    const updatedAt = new Date().toISOString();
    const revision = crypto.randomUUID();
    const document: CloudDocument = {
      schemaVersion: 1,
      revision,
      updatedAt,
      updatedBy: user.email,
      state: payload.state
    };
    if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_JSON_BYTES) {
      return json({ error: "STATE_TOO_LARGE", message: "記帳資料超過雲端同步上限。" }, 413);
    }

    try {
      if (saved) {
        await writeImmutableJson(`breakfast/backups/accounting/${updatedAt.slice(0, 10)}.json`, saved.value);
      }
      await writeJson(CURRENT_PATH, document, saved
        ? { overwrite: true, ...(force ? {} : { etag: saved.etag }) }
        : {});
    } catch (error) {
      if (isConflict(error)) {
        const latest = await readJson<CloudDocument>(CURRENT_PATH);
        return json({ error: "REVISION_CONFLICT", message: "雲端資料剛由另一台裝置更新。", revision: latest?.value.revision || "" }, 409);
      }
      throw error;
    }
    return json({ ok: true, revision, updatedAt, updatedBy: user.email, role: user.role });
  }
};
