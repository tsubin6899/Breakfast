import { next } from "@vercel/functions/middleware";
import { getSession } from "./api/_lib/auth.js";

const PUBLIC_SALARY_PATHS = [
  "/salary_app/assets/",
  "/salary_app/service-worker.js"
];

function isPublicSalaryAsset(pathname: string) {
  return PUBLIC_SALARY_PATHS.some(prefix => pathname.startsWith(prefix));
}

export default async function middleware(request: Request) {
  const requestUrl = new URL(request.url);

  // Public PWA icons and the legacy service-worker updater must stay reachable
  // so signed-out devices can display the login shell and clear old caches.
  if (isPublicSalaryAsset(requestUrl.pathname)) return next();

  const user = await getSession(request);
  if (user) {
    return next({
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  }

  const returnTo = `${requestUrl.pathname}${requestUrl.search}`.slice(0, 300);
  const loginUrl = new URL("/login/", requestUrl.origin);
  loginUrl.searchParams.set("returnTo", returnTo);
  return new Response(null, {
    status: 302,
    headers: {
      Location: loginUrl.toString(),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive"
    }
  });
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/",
    "/salary_app/:path*",
    "/accounting/:path*",
    "/dashboard_cost/:path*"
  ]
};
