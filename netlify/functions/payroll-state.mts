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
  auditEvents?: unknown;
};

const STORE_NAME = "breakfast-payroll";
const STATE_KEY = "business/payroll-state";
const PREVIOUS_STATE_KEY = "business/payroll-state-previous";
const AUDIT_KEY = "business/server-audit-log";
const MAX_BODY_BYTES = 5_500_000;

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

function accessRoles(state: unknown) {
  if (!state || typeof state !== "object") return {} as Record<string, string>;
  const settings = (state as PayrollState).settings;
  const roles = settings?.accessRoles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(roles)
      .filter(([email, role]) => email.includes("@") && ["owner", "payroll", "manager", "viewer"].includes(String(role)))
      .map(([email, role]) => [email.toLowerCase(), String(role)])
  );
}

function sanitizeAuditEvents(value: unknown, actor: string) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map(entry => {
    const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      id: typeof item.id === "string" ? item.id.slice(0, 120) : crypto.randomUUID(),
      month: typeof item.month === "string" ? item.month.slice(0, 7) : "",
      action: typeof item.action === "string" ? item.action.slice(0, 120) : "更新資料",
      detail: typeof item.detail === "string" ? item.detail.slice(0, 500) : "",
      actor,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : new Date().toISOString(),
      serverRecordedAt: new Date().toISOString()
    };
  });
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
    const email = String(user.email || "").toLowerCase();
    const roles = accessRoles(saved.data);
    const role = Object.keys(roles).length ? roles[email] : "owner";
    if (!role) {
      return jsonResponse({ error: "FORBIDDEN", message: "此帳號尚未被指派薪資 APP 權限。" }, 403);
    }
    const store = getStore({ name: STORE_NAME, consistency: "strong" });
    const auditLog = await store.get(AUDIT_KEY, { type: "json", consistency: "strong" }) as unknown[] | null;
    return jsonResponse({
      state: saved.data,
      auditLog: Array.isArray(auditLog) ? auditLog.slice(0, 500) : [],
      revision: saved.etag || "",
      updatedAt: typeof saved.metadata.updatedAt === "string" ? saved.metadata.updatedAt : "",
      updatedBy: typeof saved.metadata.updatedBy === "string" ? saved.metadata.updatedBy : "",
      user: { id: user.id, email: user.email || "", role }
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

  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const existing = await store.getWithMetadata(STATE_KEY, {
    type: "json",
    consistency: "strong"
  });
  const baseRevision = typeof payload.baseRevision === "string" ? payload.baseRevision : "";
  const force = payload.force === true;
  const email = String(user.email || user.id).toLowerCase();
  const existingRoles = accessRoles(existing?.data);
  const existingRole = Object.keys(existingRoles).length ? existingRoles[email] : "owner";
  if (!existingRole || existingRole === "viewer") {
    return jsonResponse({ error: "FORBIDDEN", message: "此帳號沒有寫入薪資資料的權限。" }, 403);
  }
  if (force && existingRole !== "owner") {
    return jsonResponse({ error: "FORBIDDEN", message: "只有店主可以強制覆蓋雲端版本。" }, 403);
  }
  const incomingState = payload.state as PayrollState;
  const incomingSettings = { ...(incomingState.settings || {}) };
  const requestedRoles = accessRoles(incomingState);
  if (!Object.keys(existingRoles).length && !Object.keys(requestedRoles).length) {
    incomingSettings.accessRoles = { [email]: "owner" };
  } else if (existingRole !== "owner" && Object.keys(existingRoles).length) {
    incomingSettings.accessRoles = existingRoles;
  } else {
    incomingSettings.accessRoles = requestedRoles;
  }
  incomingState.settings = incomingSettings;
  if (existingRole === "manager" && existing?.data && typeof existing.data === "object") {
    const protectedState = existing.data as PayrollState;
    incomingState.settings = protectedState.settings;
    incomingState.employees = protectedState.employees;
    incomingState.adjustments = protectedState.adjustments;
    incomingState.specialDays = protectedState.specialDays;
    incomingState.closedMonths = protectedState.closedMonths;
    incomingState.leaveLedger = protectedState.leaveLedger;
  }
  const existingAudit = await store.get(AUDIT_KEY, { type: "json", consistency: "strong" }) as unknown[] | null;
  incomingState.auditLog = Array.isArray(existingAudit) ? existingAudit.slice(0, 500) : [];
  const serialized = JSON.stringify(incomingState);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "STATE_TOO_LARGE", message: "薪資資料超過可儲存大小。" }, 413);
  }

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
  const result = await store.setJSON(STATE_KEY, incomingState, options);
  if (!result.modified) {
    const latest = await store.getMetadata(STATE_KEY, { consistency: "strong" });
    return jsonResponse({
      error: "REVISION_CONFLICT",
      message: "雲端資料剛被其他裝置更新，已停止覆蓋。",
      revision: latest?.etag || ""
    }, 409);
  }

  const newAuditEvents = sanitizeAuditEvents(payload.auditEvents, email);
  const serverAudit = [
    {
      id: crypto.randomUUID(),
      month: typeof incomingState.settings.month === "string" ? incomingState.settings.month : "",
      action: "雲端資料同步",
      detail: `版本 ${result.etag || ""}`,
      actor: email,
      timestamp: updatedAt,
      serverRecordedAt: updatedAt
    },
    ...newAuditEvents,
    ...(Array.isArray(existingAudit) ? existingAudit : [])
  ].slice(0, 2000);
  await store.setJSON(AUDIT_KEY, serverAudit, {
    metadata: { updatedAt, updatedBy: email }
  });
  const dayKey = updatedAt.slice(0, 10);
  await store.setJSON(`backups/${dayKey}`, incomingState, {
    metadata: { updatedAt, updatedBy: email, sourceRevision: result.etag || "" }
  });
  const closedMonths = incomingState.closedMonths || {};
  const existingClosedMonths = existing?.data && typeof existing.data === "object"
    ? ((existing.data as PayrollState).closedMonths || {})
    : {};
  await Promise.all(Object.entries(closedMonths)
    .filter(([month, value]) => {
      const monthState = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return (
        monthState.locked === true &&
        monthState.snapshot &&
        JSON.stringify(value) !== JSON.stringify(existingClosedMonths[month])
      );
    })
    .map(([month, value]) => store.setJSON(`snapshots/${month}`, value, {
      metadata: { updatedAt, updatedBy: email }
    })));

  return jsonResponse({
    ok: true,
    revision: result.etag || "",
    updatedAt,
    updatedBy: user.email || user.id,
    role: existingRole
  });
};

export const config: Config = {
  path: "/api/payroll-state",
  method: ["GET", "PUT"]
};
