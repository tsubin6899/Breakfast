import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { parseCookies, serializeCookie } from "./http.js";

export type CloudUser = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "payroll";
};

const SESSION_COOKIE = "breakfast_session";
const SESSION_ISSUER = "breakfast-operations";
const SESSION_AUDIENCE = "breakfast-admin";
const VERCEL_JWKS = createRemoteJWKSet(new URL("https://vercel.com/.well-known/jwks"));

function envList(name: string) {
  return new Set((process.env[name] || "").split(/[;,\s]+/).map(value => value.trim().toLowerCase()).filter(Boolean));
}

function sessionSecret() {
  const value = process.env.SESSION_SECRET || "";
  if (value.length < 32) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  return new TextEncoder().encode(value);
}

export function clientId() {
  const value = process.env.VERCEL_APP_CLIENT_ID || process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID || "";
  if (!value) throw new Error("VERCEL_APP_CLIENT_ID_NOT_CONFIGURED");
  return value;
}

export function clientSecret() {
  const value = process.env.VERCEL_APP_CLIENT_SECRET || "";
  if (!value) throw new Error("VERCEL_APP_CLIENT_SECRET_NOT_CONFIGURED");
  return value;
}

export function userFromClaims(payload: JWTPayload): CloudUser {
  const email = String(payload.email || "").trim().toLowerCase();
  const allowed = envList("VERCEL_ALLOWED_EMAILS");
  if (!email || !allowed.size || !allowed.has(email)) throw new Error("EMAIL_NOT_ALLOWED");
  const owners = envList("VERCEL_OWNER_EMAILS");
  return {
    id: String(payload.sub || email),
    email,
    name: String(payload.name || payload.preferred_username || email),
    role: !owners.size || owners.has(email) ? "owner" : "payroll"
  };
}

export async function verifyVercelIdToken(idToken: string, nonce: string) {
  const { payload } = await jwtVerify(idToken, VERCEL_JWKS, {
    issuer: "https://vercel.com",
    audience: [clientId()]
  });
  if (!nonce || payload.nonce !== nonce) throw new Error("INVALID_NONCE");
  return userFromClaims(payload);
}

export async function createSession(user: CloudUser) {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret());
}

export async function getSession(request: Request): Promise<CloudUser | null> {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE
    });
    return userFromClaims(payload);
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return serializeCookie(SESSION_COOKIE, token, { maxAge: 7 * 86_400 });
}

export function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE, "", { maxAge: 0 });
}
