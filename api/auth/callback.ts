import { clientId, clientSecret, createSession, sessionCookie, verifyVercelIdToken } from "../_lib/auth.js";
import { parseCookies, safeReturnPath, serializeCookie } from "../_lib/http.js";

export default {
  async fetch(request: Request) {
    const requestUrl = new URL(request.url);
    const cookies = parseCookies(request);
    const returnTo = safeReturnPath(cookies.breakfast_oauth_return);
    const errorCode = requestUrl.searchParams.get("error");
    if (errorCode) return Response.redirect(`${requestUrl.origin}${returnTo}?cloud=denied`, 302);
    const code = requestUrl.searchParams.get("code") || "";
    const state = requestUrl.searchParams.get("state") || "";
    if (!code || !state || state !== cookies.breakfast_oauth_state) {
      return Response.redirect(`${requestUrl.origin}${returnTo}?cloud=invalid`, 302);
    }
    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        code_verifier: cookies.breakfast_oauth_verifier || "",
        redirect_uri: `${requestUrl.origin}/api/auth/callback`
      });
      const tokenResponse = await fetch("https://api.vercel.com/login/oauth/token", { method: "POST", body: params });
      const tokenData = await tokenResponse.json() as { id_token?: string; error?: string };
      if (!tokenResponse.ok || !tokenData.id_token) throw new Error(tokenData.error || "TOKEN_EXCHANGE_FAILED");
      const user = await verifyVercelIdToken(tokenData.id_token, cookies.breakfast_oauth_nonce || "");
      const session = await createSession(user);
      const headers = new Headers({ Location: `${requestUrl.origin}${returnTo}?cloud=connected` });
      headers.append("Set-Cookie", sessionCookie(session));
      for (const name of ["breakfast_oauth_state", "breakfast_oauth_nonce", "breakfast_oauth_verifier", "breakfast_oauth_return"]) {
        headers.append("Set-Cookie", serializeCookie(name, "", { maxAge: 0 }));
      }
      return new Response(null, { status: 302, headers });
    } catch (error) {
      const reason = error instanceof Error && error.message === "EMAIL_NOT_ALLOWED" ? "forbidden" : "failed";
      return Response.redirect(`${requestUrl.origin}${returnTo}?cloud=${reason}`, 302);
    }
  }
};
