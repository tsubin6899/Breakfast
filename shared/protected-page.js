(() => {
  "use strict";

  const localHosts = new Set(["127.0.0.1", "localhost"]);
  if (localHosts.has(window.location.hostname)) {
    window.breakfastAuthReady = Promise.resolve({ local: true });
    return;
  }

  document.documentElement.classList.add("breakfast-auth-pending");
  const style = document.createElement("style");
  style.id = "breakfast-auth-pending-style";
  style.textContent = "html.breakfast-auth-pending body{visibility:hidden!important}";
  document.head.appendChild(style);

  const returnTo = `${location.pathname}${location.search}${location.hash}`.slice(0, 300);
  const loginUrl = new URL("/login/", location.origin);
  loginUrl.searchParams.set("returnTo", returnTo);

  function lockPage() {
    document.documentElement.classList.add("breakfast-auth-pending");
    if (!style.isConnected) document.head.appendChild(style);
  }

  function redirectToLogin() {
    lockPage();
    window.location.replace(loginUrl.href);
  }

  window.breakfastSignOut = async (nextPath = location.pathname) => {
    const safeNextPath = String(nextPath).startsWith("/") && !String(nextPath).startsWith("//")
      ? String(nextPath).slice(0, 300)
      : "/salary_app/";
    const signedOutUrl = new URL("/login/", location.origin);
    signedOutUrl.searchParams.set("returnTo", safeNextPath);
    lockPage();
    await fetch("/api/auth/signout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" }
    }).catch(() => null);
    window.location.replace(signedOutUrl.href);
  };

  window.breakfastAuthReady = fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" }
  })
    .then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.user) throw new Error("UNAUTHORIZED");
      document.documentElement.classList.remove("breakfast-auth-pending");
      style.remove();
      window.dispatchEvent(new CustomEvent("breakfast-auth-ready", { detail: result.user }));
      return result.user;
    })
    .catch(() => {
      redirectToLogin();
      return null;
    });

  async function revalidateSession() {
    const response = await fetch("/api/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).catch(() => null);
    if (!response?.ok) redirectToLogin();
  }

  window.breakfastAuthReady.then(user => {
    if (!user) return;
    window.setInterval(revalidateSession, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revalidateSession();
    });
  });
})();
