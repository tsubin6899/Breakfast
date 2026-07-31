import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import type { Config, Context } from "@netlify/functions";

const STORE_NAME = "breakfast-payroll";
const STATE_KEY = "business/payroll-state";
const SHARE_PREFIX = "employee-shares/";
const MAX_BODY_BYTES = 400_000;

type ShareRecord = {
  statement: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  response?: {
    status: "confirmed" | "question";
    message: string;
    submittedAt: string;
  };
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === new URL(req.url).origin);
}

function rolesFromState(state: unknown) {
  if (!state || typeof state !== "object") return {} as Record<string, string>;
  const settings = (state as { settings?: { accessRoles?: unknown } }).settings;
  const roles = settings?.accessRoles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(roles).map(([email, role]) => [email.toLowerCase(), String(role)]));
}

export default async (req: Request, context: Context) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";

  if (req.method === "GET") {
    if (!/^[a-f0-9-]{64,80}$/.test(token)) {
      return json({ error: "INVALID_LINK", message: "核對連結格式不正確。" }, 400);
    }
    const record = await store.get(`${SHARE_PREFIX}${token}`, { type: "json", consistency: "strong" }) as ShareRecord | null;
    if (!record) return json({ error: "NOT_FOUND", message: "找不到這份員工核對資料。" }, 404);
    if (record.expiresAt < new Date().toISOString()) {
      return json({ error: "EXPIRED", message: "這份員工核對連結已過期，請向店內索取新連結。" }, 410);
    }
    return json({
      statement: record.statement,
      expiresAt: record.expiresAt,
      response: record.response || null
    });
  }

  if (!sameOrigin(req)) {
    return json({ error: "INVALID_ORIGIN", message: "無法驗證資料來源。" }, 403);
  }
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "BODY_TOO_LARGE", message: "資料內容過大。" }, 413);
  }

  if (req.method === "PUT") {
    if (!/^[a-f0-9-]{64,80}$/.test(token)) {
      return json({ error: "INVALID_LINK", message: "核對連結格式不正確。" }, 400);
    }
    const record = await store.get(`${SHARE_PREFIX}${token}`, { type: "json", consistency: "strong" }) as ShareRecord | null;
    if (!record) return json({ error: "NOT_FOUND", message: "找不到這份員工核對資料。" }, 404);
    if (record.expiresAt < new Date().toISOString()) {
      return json({ error: "EXPIRED", message: "這份員工核對連結已過期。" }, 410);
    }
    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const status = payload.status === "question" ? "question" : "confirmed";
    const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 1000) : "";
    if (status === "question" && !message) {
      return json({ error: "MESSAGE_REQUIRED", message: "提出問題時請填寫說明。" }, 400);
    }
    const response = { status, message, submittedAt: new Date().toISOString() };
    await store.setJSON(`${SHARE_PREFIX}${token}`, { ...record, response }, {
      metadata: { expiresAt: record.expiresAt, updatedAt: response.submittedAt }
    });
    return json({ ok: true, response });
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED", message: "不支援此操作。" }, 405);
  }

  const user = await getUser();
  if (!user) return json({ error: "UNAUTHORIZED", message: "請先登入管理者帳號。" }, 401);
  const state = await store.get(STATE_KEY, { type: "json", consistency: "strong" });
  const roles = rolesFromState(state);
  const email = String(user.email || "").toLowerCase();
  const role = Object.keys(roles).length ? roles[email] : "owner";
  if (!["owner", "payroll"].includes(role || "")) {
    return json({ error: "FORBIDDEN", message: "目前帳號沒有建立員工核對連結的權限。" }, 403);
  }

  const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
  const statement = payload.statement;
  if (!statement || typeof statement !== "object" || Array.isArray(statement)) {
    return json({ error: "INVALID_STATEMENT", message: "員工明細格式不正確。" }, 400);
  }
  const serialized = JSON.stringify(statement);
  if (new TextEncoder().encode(serialized).byteLength > MAX_BODY_BYTES) {
    return json({ error: "BODY_TOO_LARGE", message: "員工明細內容過大。" }, 413);
  }
  const requestedDays = Number(payload.expiresInDays || 7);
  const days = Math.max(1, Math.min(30, Number.isFinite(requestedDays) ? requestedDays : 7));
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + days * 86_400_000).toISOString();
  const shareToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.toLowerCase();
  const record: ShareRecord = {
    statement: statement as Record<string, unknown>,
    createdAt: createdAt.toISOString(),
    createdBy: email || user.id,
    expiresAt
  };
  await store.setJSON(`${SHARE_PREFIX}${shareToken}`, record, {
    metadata: {
      expiresAt,
      createdBy: email || user.id,
      requestId: context.requestId
    }
  });
  return json({
    ok: true,
    url: `/employee_portal/?token=${encodeURIComponent(shareToken)}`,
    expiresAt
  });
};

export const config: Config = {
  path: "/api/employee-share",
  method: ["GET", "POST", "PUT"]
};
