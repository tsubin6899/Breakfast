import { clearSessionCookie } from "../_lib/auth.js";
import { isSameOrigin, json } from "../_lib/http.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!isSameOrigin(request)) return json({ error: "INVALID_ORIGIN" }, 403);
    return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
  }
};
