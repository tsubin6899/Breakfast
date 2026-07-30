import { getStore } from "@netlify/blobs";
import { getUser, refreshSession } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

type PayrollState = {
  settings: Record<string, unknown>;
  employees: unknown[];
  attendance?: Record<string, unknown>;
  leaveRecords?: Record<string, unknown>;
  adjustments?: unknown[];
  specialDays?: unknown[];
  closedMonths?: Record<string, unknown>;
  auditLog?: unknown[];
  [key: string]: unknown;
};

type SaveRequest = {
  state?: unknown;
  baseRevision?: unknown;
  force?: unknown;
};

const STORE_NAME = "breakfast-payroll";
const STATE_KEY = "business/payroll-state";
const PREVIOUS_STATE_KEY = "business/payroll-state-previous";
const MAX_BODY_BYTES = 2_500_000;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function isPayrollState(value: unknown): value is PayrollState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<PayrollState>;
  return Boolean(
    state.settings &&
    typeof state.settings === "object" &&
    !Array.isArray(state.settings) &&
    Array.isArray(state.employees)
  );
}

function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin) {
    throw new Error("INVALID_ORIGIN");
  }
}

async function readState() {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  return store.getWithMetadata(STATE_KEY, { type: "json", consistency: "strong" });
}

export default async (req: Request, context: Context) => {
  let user = null;
  try {
    await refreshSession().catch(() => null);
    user = await getUser();
  } catch {
    return jsonResponse({
      error: "IDENTITY_UNAVAILABLE",
      message: "Netlify 管理者登入尚未啟用，請先完成 Identity 設定。"
    }, 503);
  }
  if (!user) {
    return jsonResponse({
      error: "UNAUTHORIZED",
      message: "請先使用管理者帳號登入。"
    }, 401);
  }

  if (req.method === "GET") {
    const saved = await readState();
    if (!saved) {
      return jsonResponse({
        state: null,
        revision: "",
        updatedAt: "",
        updatedBy: "",
        user: { id: user.id, email: user.email || "" }
      });
    }
    return jsonResponse({
      state: saved.data,
      revision: saved.etag || "",
      updatedAt: typeof saved.metadata.updatedAt === "string" ? saved.metadata.updatedAt : "",
      updatedBy: typeof saved.metadata.updatedBy === "string" ? saved.metadata.updatedBy : "",
      user: { id: user.id, email: user.email || "" }
    });
  }

  if (req.method !== "PUT") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED", message: "只接受 GET 或 PUT。" }, 405);
  }

  try {
    requireSameOrigin(req);
  } catch {
    return jsonResponse({ error: "INVALID_ORIGIN", message: "無法驗證資料寫入來源。" }, 403);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "STATE_TOO_LARGE", message: "薪資資料超過可儲存大小。" }, 413);
  }

  let payload: SaveRequest;
  try {
    payload = await req.json() as SaveRequest;
  } catch {
    return jsonResponse({ error: "INVALID_JSON", message: "無法讀取薪資資料。" }, 400);
  }
  if (!isPayrollState(payload.state)) {
    return jsonResponse({ error: "INVALID_STATE", message: "薪資資料格式不正確。" }, 400);
  }

  const serialized = JSON.stringify(payload.state);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "STATE_TOO_LARGE", message: "薪資資料超過可儲存大小。" }, 413);
  }

  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const existing = await store.getWithMetadata(STATE_KEY, {
    type: "json",
    consistency: "strong"
  });
  const baseRevision = typeof payload.baseRevision === "string" ? payload.baseRevision : "";
  const force = payload.force === true;

  if (!force) {
    const currentRevision = existing?.etag || "";
    if (currentRevision !== baseRevision) {
      return jsonResponse({
        error: "REVISION_CONFLICT",
        message: "雲端已有較新的版本，已停止覆蓋。",
        revision: currentRevision,
        updatedAt: existing?.metadata?.updatedAt || "",
        updatedBy: existing?.metadata?.updatedBy || ""
      }, 409);
    }
  }

  if (existing?.data) {
    await store.setJSON(PREVIOUS_STATE_KEY, existing.data, {
      metadata: {
        backedUpAt: new Date().toISOString(),
        sourceRevision: existing.etag || ""
      }
    });
  }

  const updatedAt = new Date().toISOString();
  const options = {
    metadata: {
      updatedAt,
      updatedBy: user.email || user.id,
      requestId: context.requestId
    },
    ...(!force && existing?.etag
      ? { onlyIfMatch: existing.etag }
      : (!force && !existing ? { onlyIfNew: true } : {}))
  };
  const result = await store.setJSON(STATE_KEY, payload.state, options);
  if (!result.modified) {
    const latest = await store.getMetadata(STATE_KEY, { consistency: "strong" });
    return jsonResponse({
      error: "REVISION_CONFLICT",
      message: "雲端資料剛被其他裝置更新，已停止覆蓋。",
      revision: latest?.etag || ""
    }, 409);
  }

  return jsonResponse({
    ok: true,
    revision: result.etag || "",
    updatedAt,
    updatedBy: user.email || user.id
  });
};

export const config: Config = {
  path: "/api/payroll-state",
  method: ["GET", "PUT"]
};
