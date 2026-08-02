import { createHash, randomBytes } from "node:crypto";
import { clientId } from "../_lib/auth.js";
import { safeReturnPath, serializeCookie } from "../_lib/http.js";

function randomValue() { return randomBytes(32).toString("base64url"); }

export default {
  async fetch(request: Request) {
    try {
      const requestUrl = new URL(request.url);
      const state = randomValue();
      const nonce = randomValue();
      const verifier = randomValue();
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const redirectUri = `${requestUrl.origin}/api/auth/callback`;
      const params = new URLSearchParams({
        client_id: clientId(),
        code_challenge: challenge,
        code_challenge_method: "S256",
        nonce,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid email profile",
        state
      });
      const headers = new Headers({ Location: `https://vercel.com/oauth/authorize?${params}` });
      const cookieOptions = { maxAge: 600, secure: requestUrl.protocol === "https:" };
      headers.append("Set-Cookie", serializeCookie("breakfast_oauth_state", state, cookieOptions));
      headers.append("Set-Cookie", serializeCookie("breakfast_oauth_nonce", nonce, cookieOptions));
      headers.append("Set-Cookie", serializeCookie("breakfast_oauth_verifier", verifier, cookieOptions));
      headers.append("Set-Cookie", serializeCookie("breakfast_oauth_return", safeReturnPath(requestUrl.searchParams.get("returnTo")), cookieOptions));
      return new Response(null, { status: 302, headers });
    } catch (error) {
      console.error("Vercel OAuth authorize initialization failed", error);
      return Response.json({ error: "AUTH_NOT_CONFIGURED", message: "Vercel 登入尚未完成設定。", detail: error instanceof Error ? error.message : "" }, { status: 503 });
    }
  }
};
