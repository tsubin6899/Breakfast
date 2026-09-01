import { gunzipSync, gzipSync } from "node:zlib";
import { getSession } from "./_lib/auth.js";
import { readJson, writeImmutableJson, writeJson, type StoredJson } from "./_lib/blob-store.js";
import { isSameOrigin, json } from "./_lib/http.js";

type ModuleName = "accounting" | "payroll";

type AccountingState = {
  version: number;
  transactions: unknown[];
  [key: string]: unknown;
};

type PayrollState = {
  settings: Record<string, unknown>;
  employees: unknown[];
  closedMonths?: Record<string, unknown>;
  auditLog?: unknown[];
  [key: string]: unknown;
};

type WorkspaceModule = {
  revision: string;
  updatedAt: string;
  updatedBy: string;
  state: AccountingState | PayrollState;
  auditLog?: unknown[];
};

type WorkspaceDocument = {
  schemaVersion: 2;
  revision: string;
  updatedAt: string;
  updatedBy: string;
  modules: Partial<Record<ModuleName, WorkspaceModule>>;
};

type LegacyDocument = {
  revision: string;
  updatedAt: string;
  updatedBy: string;
  state: AccountingState | PayrollState;
  auditLog?: unknown[];
};

const WORKSPACE_PATH = "breakfast/state/operations-workspace-current.json";
const LEGACY_ACCOUNTING_PATH = "breakfast/state/accounting-current.json";
const LEGACY_PAYROLL_PATH = "breakfast/state/payroll-current.json";
const MAX_COMPRESSED_BYTES = 8_000_000;
const MAX_JSON_BYTES = 30_000_000;

function moduleFromRequest(request: Request, payload?: { module?: unknown }) {
  const value = payload?.module || new URL(request.url).searchParams.get("module");
  return value === "accounting" || value === "payroll" ? value : null;
}

function isAccountingState(value: unknown): value is AccountingState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<AccountingState>;
  return Number.isFinite(Number(state.version)) && Array.isArray(state.transactions);
}

function isPayrollState(value: unknown): value is PayrollState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<PayrollState>;
  return Boolean(state.settings && typeof state.settings === "object" && !Array.isArray(state.settings) && Array.isArray(state.employees));
}

function isModuleState(moduleName: ModuleName, value: unknown) {
  return moduleName === "accounting" ? isAccountingState(value) : isPayrollState(value);
}

function accessRoles(state: unknown) {
  if (!isPayrollState(state)) return {} as Record<string, string>;
  const roles = state.settings?.accessRoles;
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
  const item = error as { status?: number; statusCode?: number; name?: string; code?: string; message?: string };
  const message = String(item?.message || "").toLowerCase();
  return item?.status === 409 || item?.statusCode === 409 ||
    item?.name === "BlobPreconditionFailedError" || item?.name === "BlobAlreadyExistsError" ||
    item?.code === "precondition_failed" || message.includes("etag mismatch") || message.includes("already exists");
}

function latestTimestamp(values: string[]) {
  return values.filter(Boolean).sort().at(-1) || "";
}

async function readWorkspace(): Promise<{ stored: StoredJson<WorkspaceDocument> | null; value: WorkspaceDocument }> {
  const stored = await readJson<WorkspaceDocument>(WORKSPACE_PATH);
  if (stored) return { stored, value: stored.value };

  const [accounting, payroll] = await Promise.all([
    readJson<LegacyDocument>(LEGACY_ACCOUNTING_PATH),
    readJson<LegacyDocument>(LEGACY_PAYROLL_PATH)
  ]);
  const modules: WorkspaceDocument["modules"] = {};
  if (accounting?.value?.state) {
    modules.accounting = {
      revision: accounting.value.revision || "",
      updatedAt: accounting.value.updatedAt || "",
      updatedBy: accounting.value.updatedBy || "",
      state: accounting.value.state
    };
  }
  if (payroll?.value?.state) {
    modules.payroll = {
      revision: payroll.value.revision || "",
      updatedAt: payroll.value.updatedAt || "",
      updatedBy: payroll.value.updatedBy || "",
      state: payroll.value.state,
      auditLog: payroll.value.auditLog || []
    };
  }
  const updatedAt = latestTimestamp(Object.values(modules).map(item => item?.updatedAt || ""));
  return {
    stored: null,
    value: {
      schemaVersion: 2,
      revision: "",
      updatedAt,
      updatedBy: Object.values(modules).find(item => item?.updatedAt === updatedAt)?.updatedBy || "",
      modules
    }
  };
}

async function readPayload(request: Request) {
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > MAX_COMPRESSED_BYTES) throw new Error("COMPRESSED_STATE_TOO_LARGE");
  const decoded = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
  if (decoded.byteLength > MAX_JSON_BYTES) throw new Error("STATE_TOO_LARGE");
  return JSON.parse(new TextDecoder().decode(decoded)) as {
    module?: unknown;
    state?: unknown;
    baseRevision?: unknown;
    force?: unknown;
    auditEvents?: unknown;
  };
}

function compressedJson(value: unknown) {
  return new Response(gzipSync(JSON.stringify(value)), { headers: {
    "Cache-Control": "no-store, private",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Encoding": "gzip",
    "X-Content-Type-Options": "nosniff"
  } });
}

export default {
  async fetch(request: Request) {
    const user = await getSession(request);
    if (!user) return json({ error: "UNAUTHORIZED", message: "請先登入後再同步營運資料。" }, 401);

    const workspace = await readWorkspace();
    const queryModule = moduleFromRequest(request);
    if (request.method === "GET") {
      if (!queryModule) return json({ error: "INVALID_MODULE", message: "請指定要同步的資料類型。" }, 400);
      const current = workspace.value.modules[queryModule];
      const role = queryModule === "payroll" ? roleFor(current?.state, user.email, user.role) : user.role;
      if (!role) return json({ error: "FORBIDDEN", message: "此帳號尚未被指派薪資 APP 權限。" }, 403);
      return compressedJson(current ? {
        state: current.state,
        auditLog: current.auditLog || [],
        revision: current.revision,
        updatedAt: current.updatedAt,
        updatedBy: current.updatedBy,
        workspaceRevision: workspace.value.revision,
        workspaceUpdatedAt: workspace.value.updatedAt,
        user: { ...user, role }
      } : {
        state: null,
        revision: "",
        updatedAt: "",
        updatedBy: "",
        workspaceRevision: workspace.value.revision,
        workspaceUpdatedAt: workspace.value.updatedAt,
        user: { ...user, role }
      });
    }
    if (request.method !== "PUT") return json({ error: "METHOD_NOT_ALLOWED", message: "僅支援 GET 與 PUT。" }, 405);
    if (!isSameOrigin(request)) return json({ error: "INVALID_ORIGIN", message: "無法確認資料寫入來源。" }, 403);

    let payload;
    try {
      payload = await readPayload(request);
    } catch (error) {
      const code = error instanceof Error ? error.message : "INVALID_JSON";
      const tooLarge = code.includes("TOO_LARGE");
      return json({ error: tooLarge ? "STATE_TOO_LARGE" : "INVALID_JSON", message: tooLarge ? "營運資料超過雲端同步上限。" : "無法讀取營運資料。" }, tooLarge ? 413 : 400);
    }
    const moduleName = moduleFromRequest(request, payload);
    if (!moduleName || !isModuleState(moduleName, payload.state)) {
      return json({ error: "INVALID_STATE", message: "營運資料格式不完整。" }, 400);
    }

    const current = workspace.value.modules[moduleName];
    const role = moduleName === "payroll" ? roleFor(current?.state, user.email, user.role) : user.role;
    if (!role) return json({ error: "FORBIDDEN", message: "此帳號尚未被指派薪資 APP 權限。" }, 403);
    if (moduleName === "payroll" && role === "viewer") return json({ error: "FORBIDDEN", message: "此帳號沒有寫入薪資資料的權限。" }, 403);
    const force = payload.force === true;
    if (force && role !== "owner") return json({ error: "FORBIDDEN", message: "只有店主可以強制覆蓋雲端版本。" }, 403);
    if (!force && String(payload.baseRevision || "") !== (current?.revision || "")) {
      return json({
        error: "REVISION_CONFLICT",
        message: "雲端資料已有較新的版本，已停止覆蓋。",
        revision: current?.revision || "",
        updatedAt: current?.updatedAt || "",
        updatedBy: current?.updatedBy || ""
      }, 409);
    }

    const updatedAt = new Date().toISOString();
    const revision = crypto.randomUUID();
    let incoming = payload.state as AccountingState | PayrollState;
    let serverAudit: unknown[] | undefined;
    if (moduleName === "payroll") {
      incoming = { ...(incoming as PayrollState), settings: { ...(incoming as PayrollState).settings } };
      const payroll = incoming as PayrollState;
      const existingRoles = accessRoles(current?.state);
      const requestedRoles = accessRoles(payroll);
      if (!Object.keys(existingRoles).length && !Object.keys(requestedRoles).length) payroll.settings.accessRoles = { [user.email]: "owner" };
      else if (role !== "owner" && Object.keys(existingRoles).length) payroll.settings.accessRoles = existingRoles;
      if (role === "manager" && current?.state && isPayrollState(current.state)) {
        for (const key of ["settings", "employees", "adjustments", "specialDays", "closedMonths", "leaveLedger"]) payroll[key] = current.state[key];
      }
      const newAudit = auditEvents(payload.auditEvents, user.email);
      serverAudit = [{ id: crypto.randomUUID(), month: String(payroll.settings.month || ""), action: "營運雲端資料同步", detail: `薪資版本 ${revision}`, actor: user.email, timestamp: updatedAt, serverRecordedAt: updatedAt }, ...newAudit, ...(current?.auditLog || [])].slice(0, 2000);
      payroll.auditLog = serverAudit.slice(0, 500);
    }

    const nextModule: WorkspaceModule = {
      revision,
      updatedAt,
      updatedBy: user.email,
      state: incoming,
      ...(serverAudit ? { auditLog: serverAudit } : {})
    };
    const document: WorkspaceDocument = {
      schemaVersion: 2,
      revision: crypto.randomUUID(),
      updatedAt,
      updatedBy: user.email,
      modules: { ...workspace.value.modules, [moduleName]: nextModule }
    };
    if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_JSON_BYTES) {
      return json({ error: "STATE_TOO_LARGE", message: "營運資料超過雲端同步上限。" }, 413);
    }

    let savedDocument = document;
    try {
      if (workspace.stored) {
        await writeImmutableJson(`breakfast/backups/workspace/${updatedAt.slice(0, 10)}/${updatedAt.replace(/[:.]/g, "-")}.json`, workspace.value);
      }
      await writeJson(WORKSPACE_PATH, document, workspace.stored
        ? { overwrite: true, ...(force ? {} : { etag: workspace.stored.etag }) }
        : {});
    } catch (error) {
      if (isConflict(error)) {
        const latest = await readJson<WorkspaceDocument>(WORKSPACE_PATH);
        const latestModule = latest?.value.modules[moduleName];
        // 薪資與記帳若剛好同時同步，只要目前模組沒有被別台改過，
        // 就把這次更新合併到最新工作區，避免兩個模組互相製造假衝突。
        if (!force && latest && (latestModule?.revision || "") === (current?.revision || "")) {
          savedDocument = {
            ...latest.value,
            schemaVersion: 2,
            revision: crypto.randomUUID(),
            updatedAt,
            updatedBy: user.email,
            modules: { ...latest.value.modules, [moduleName]: nextModule }
          };
          try {
            await writeJson(WORKSPACE_PATH, savedDocument, { overwrite: true, etag: latest.etag });
          } catch (retryError) {
            if (!isConflict(retryError)) throw retryError;
            const newest = await readJson<WorkspaceDocument>(WORKSPACE_PATH);
            const newestModule = newest?.value.modules[moduleName];
            return json({
              error: "REVISION_CONFLICT",
              message: "營運雲端資料剛由另一台裝置更新。",
              revision: newestModule?.revision || "",
              updatedAt: newestModule?.updatedAt || "",
              updatedBy: newestModule?.updatedBy || ""
            }, 409);
          }
        } else {
          return json({
            error: "REVISION_CONFLICT",
            message: "營運雲端資料剛由另一台裝置更新。",
            revision: latestModule?.revision || "",
            updatedAt: latestModule?.updatedAt || "",
            updatedBy: latestModule?.updatedBy || ""
          }, 409);
        }
      }
      else throw error;
    }
    if (moduleName === "payroll") {
      const previousClosed = isPayrollState(current?.state) ? current.state.closedMonths || {} : {};
      const nextClosed = (incoming as PayrollState).closedMonths || {};
      await Promise.all(Object.entries(nextClosed).filter(([month, value]) => {
        const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
        return item.locked === true && item.snapshot && JSON.stringify(value) !== JSON.stringify(previousClosed[month]);
      }).map(([month, value]) => writeImmutableJson(`breakfast/snapshots/payroll/${month}/${updatedAt.replace(/[:.]/g, "-")}.json`, value)));
    }
    return json({
      ok: true,
      revision,
      updatedAt,
      updatedBy: user.email,
      workspaceRevision: savedDocument.revision,
      workspaceUpdatedAt: savedDocument.updatedAt,
      role
    });
  }
};
