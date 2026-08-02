import { getSession } from "./_lib/auth.js";
import { readJson, writeJson } from "./_lib/blob-store.js";
import { isSameOrigin, json } from "./_lib/http.js";

type ShareRecord = {
  statement: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  expiresAt: string;
  response?: { status: "confirmed" | "question"; message: string; submittedAt: string };
};

const MAX_BODY_BYTES = 400_000;
const TOKEN_PATTERN = /^[a-f0-9-]{64,80}$/;
const pathFor = (token: string) => `breakfast/employee-shares/${token}.json`;

function rolesFromState(state: unknown) {
  if (!state || typeof state !== "object") return {} as Record<string, string>;
  const roles = (state as { settings?: { accessRoles?: unknown } }).settings?.accessRoles;
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return {} as Record<string, string>;
  return Object.fromEntries(Object.entries(roles).map(([email, role]) => [email.toLowerCase(), String(role)]));
}

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") || "";
    if (request.method === "GET") {
      if (!TOKEN_PATTERN.test(token)) return json({ error: "INVALID_LINK", message: "核對連結格式不正確。" }, 400);
      const saved = await readJson<ShareRecord>(pathFor(token));
      if (!saved) return json({ error: "NOT_FOUND", message: "找不到這份員工核對資料。" }, 404);
      if (saved.value.expiresAt < new Date().toISOString()) return json({ error: "EXPIRED", message: "這份員工核對連結已過期，請向店內索取新連結。" }, 410);
      return json({ statement: saved.value.statement, expiresAt: saved.value.expiresAt, response: saved.value.response || null });
    }
    if (!isSameOrigin(request)) return json({ error: "INVALID_ORIGIN", message: "無法驗證資料來源。" }, 403);
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "BODY_TOO_LARGE", message: "資料內容過大。" }, 413);

    if (request.method === "PUT") {
      if (!TOKEN_PATTERN.test(token)) return json({ error: "INVALID_LINK", message: "核對連結格式不正確。" }, 400);
      const saved = await readJson<ShareRecord>(pathFor(token));
      if (!saved) return json({ error: "NOT_FOUND", message: "找不到這份員工核對資料。" }, 404);
      if (saved.value.expiresAt < new Date().toISOString()) return json({ error: "EXPIRED", message: "這份員工核對連結已過期。" }, 410);
      const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
      const status = payload.status === "question" ? "question" : "confirmed";
      const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 1000) : "";
      if (status === "question" && !message) return json({ error: "MESSAGE_REQUIRED", message: "提出問題時請填寫說明。" }, 400);
      const response = { status, message, submittedAt: new Date().toISOString() } as const;
      try {
        await writeJson(pathFor(token), { ...saved.value, response }, { overwrite: true, etag: saved.etag });
      } catch {
        return json({ error: "REVISION_CONFLICT", message: "員工回覆剛被更新，請重新整理。" }, 409);
      }
      return json({ ok: true, response });
    }
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED", message: "不支援此操作。" }, 405);

    const user = await getSession(request);
    if (!user) return json({ error: "UNAUTHORIZED", message: "請先登入管理者帳號。" }, 401);
    const payroll = await readJson<{ state?: unknown }>("breakfast/state/payroll-current.json");
    const roles = rolesFromState(payroll?.value.state);
    const role = Object.keys(roles).length ? roles[user.email] : user.role;
    if (!['owner', 'payroll'].includes(role || "")) return json({ error: "FORBIDDEN", message: "目前帳號沒有建立員工核對連結的權限。" }, 403);
    const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (!payload.statement || typeof payload.statement !== "object" || Array.isArray(payload.statement)) return json({ error: "INVALID_STATEMENT", message: "員工明細格式不正確。" }, 400);
    if (new TextEncoder().encode(JSON.stringify(payload.statement)).byteLength > MAX_BODY_BYTES) return json({ error: "BODY_TOO_LARGE", message: "員工明細內容過大。" }, 413);
    const days = Math.max(1, Math.min(30, Number(payload.expiresInDays || 7)));
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + days * 86_400_000).toISOString();
    const shareToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.toLowerCase();
    const record: ShareRecord = { statement: payload.statement as Record<string, unknown>, createdAt: createdAt.toISOString(), createdBy: user.email, expiresAt };
    await writeJson(pathFor(shareToken), record);
    return json({ ok: true, url: `/employee_portal/?token=${encodeURIComponent(shareToken)}`, expiresAt });
  }
};
