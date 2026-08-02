import { getSession } from "./_lib/auth.js";
import { readJson, writeImmutableJson, writeJson } from "./_lib/blob-store.js";
import { isSameOrigin, json } from "./_lib/http.js";

type PayrollState = {
  settings: Record<string, unknown>;
  employees: unknown[];
  closedMonths?: Record<string, unknown>;
  auditLog?: unknown[];
  [key: string]: unknown;
};

type CloudDocument = {
  schemaVersion: 1;
  revision: string;
  updatedAt: string;
  updatedBy: string;
  state: PayrollState;
  auditLog: unknown[];
};

const CURRENT_PATH = "breakfast/state/payroll-current.json";
const MAX_BODY_BYTES = 5_500_000;

function isPayrollState(value: unknown): value is PayrollState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<PayrollState>;
  return Boolean(state.settings && typeof state.settings === "object" && !Array.isArray(state.settings) && Array.isArray(state.employees));
}

function accessRoles(state: unknown) {
  if (!state || typeof state !== "object") return {} as Record<string, string>;
  const roles = (state as PayrollState).settings?.accessRoles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(roles as Record<string, unknown>)
    .filter(([email, role]) => email.includes("@") && ["owner", "payroll", "manager", "viewer"].includes(String(role)))
    .map(([email, role]) => [email.toLowerCase(), String(role)]));
}

function roleFor(state: unknown, email: string, fallback: string) {
  const roles = accessRoles(state);
  return Object.keys(roles).length ? roles[email] || "" : fallback;
}

function auditEvents(value: unknown, actor: string) {
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

function isConflict(error: unknown) {
  const item = error as { status?: number; statusCode?: number; name?: string; code?: string };
  return item?.status === 409 || item?.statusCode === 409 || item?.name === "BlobPreconditionFailedError" || item?.code === "precondition_failed";
}

export default {
  async fetch(request: Request) {
    const user = await getSession(request);
    if (!user) return json({ error: "UNAUTHORIZED", message: "請先使用管理者帳號登入。" }, 401);
    const saved = await readJson<CloudDocument>(CURRENT_PATH);
    const role = roleFor(saved?.value.state, user.email, user.role);
    if (!role) return json({ error: "FORBIDDEN", message: "此帳號尚未被指派薪資 APP 權限。" }, 403);

    if (request.method === "GET") {
      return json(saved ? {
        state: saved.value.state,
        auditLog: saved.value.auditLog || [],
        revision: saved.value.revision,
        updatedAt: saved.value.updatedAt,
        updatedBy: saved.value.updatedBy,
        user: { ...user, role }
      } : { state: null, revision: "", updatedAt: "", updatedBy: "", user: { ...user, role } });
    }
    if (request.method !== "PUT") return json({ error: "METHOD_NOT_ALLOWED", message: "只接受 GET 或 PUT。" }, 405);
    if (!isSameOrigin(request)) return json({ error: "INVALID_ORIGIN", message: "無法驗證資料寫入來源。" }, 403);
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "STATE_TOO_LARGE", message: "薪資資料超過可儲存大小。" }, 413);

    const payload = await request.json().catch(() => null) as { state?: unknown; baseRevision?: unknown; force?: unknown; auditEvents?: unknown } | null;
    if (!payload || !isPayrollState(payload.state)) return json({ error: "INVALID_STATE", message: "薪資資料格式不正確。" }, 400);
    if (role === "viewer") return json({ error: "FORBIDDEN", message: "此帳號沒有寫入薪資資料的權限。" }, 403);
    const force = payload.force === true;
    if (force && role !== "owner") return json({ error: "FORBIDDEN", message: "只有店主可以強制覆蓋雲端版本。" }, 403);
    if (!force && String(payload.baseRevision || "") !== (saved?.value.revision || "")) {
      return json({ error: "REVISION_CONFLICT", message: "雲端已有較新的版本，已停止覆蓋。", revision: saved?.value.revision || "", updatedAt: saved?.value.updatedAt || "", updatedBy: saved?.value.updatedBy || "" }, 409);
    }

    const incoming = payload.state as PayrollState;
    const existingRoles = accessRoles(saved?.value.state);
    const requestedRoles = accessRoles(incoming);
    incoming.settings = { ...incoming.settings };
    if (!Object.keys(existingRoles).length && !Object.keys(requestedRoles).length) incoming.settings.accessRoles = { [user.email]: "owner" };
    else if (role !== "owner" && Object.keys(existingRoles).length) incoming.settings.accessRoles = existingRoles;
    if (role === "manager" && saved?.value.state) {
      for (const key of ["settings", "employees", "adjustments", "specialDays", "closedMonths", "leaveLedger"]) incoming[key] = saved.value.state[key];
    }

    const updatedAt = new Date().toISOString();
    const revision = crypto.randomUUID();
    const newAudit = auditEvents(payload.auditEvents, user.email);
    const serverAudit = [{ id: crypto.randomUUID(), month: String(incoming.settings.month || ""), action: "雲端資料同步", detail: `版本 ${revision}`, actor: user.email, timestamp: updatedAt, serverRecordedAt: updatedAt }, ...newAudit, ...(saved?.value.auditLog || [])].slice(0, 2000);
    incoming.auditLog = serverAudit.slice(0, 500);
    const document: CloudDocument = { schemaVersion: 1, revision, updatedAt, updatedBy: user.email, state: incoming, auditLog: serverAudit };
    if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_BODY_BYTES) return json({ error: "STATE_TOO_LARGE", message: "薪資資料超過可儲存大小。" }, 413);

    try {
      if (saved) {
        const day = updatedAt.slice(0, 10);
        await writeImmutableJson(`breakfast/backups/payroll/${day}.json`, saved.value);
      }
      await writeJson(CURRENT_PATH, document, saved ? { overwrite: true, ...(force ? {} : { etag: saved.etag }) } : {});
      const previousClosed = saved?.value.state.closedMonths || {};
      await Promise.all(Object.entries(incoming.closedMonths || {}).filter(([month, value]) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return item.locked === true && item.snapshot && JSON.stringify(value) !== JSON.stringify(previousClosed[month]);
      }).map(([month, value]) => writeImmutableJson(`breakfast/snapshots/payroll/${month}/${updatedAt.replace(/[:.]/g, "-")}.json`, value)));
    } catch (error) {
      if (isConflict(error)) {
        const latest = await readJson<CloudDocument>(CURRENT_PATH);
        return json({ error: "REVISION_CONFLICT", message: "雲端資料剛被其他裝置更新，已停止覆蓋。", revision: latest?.value.revision || "" }, 409);
      }
      throw error;
    }
    return json({ ok: true, revision, updatedAt, updatedBy: user.email, role });
  }
};
