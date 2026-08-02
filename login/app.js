(() => {
  "use strict";

  const status = document.querySelector("#login-status");
  const button = document.querySelector("#login-button");
  const query = new URLSearchParams(location.search);
  const rawReturnTo = query.get("returnTo") || "/salary_app/";
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") && !rawReturnTo.includes("\\")
    ? rawReturnTo.slice(0, 300)
    : "/salary_app/";
  const returnUrl = new URL(returnTo, location.origin);
  const authResult = returnUrl.searchParams.get("cloud");

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function showLogin(message, tone = "waiting") {
    setStatus(message, tone);
    button.hidden = false;
  }

  button.addEventListener("click", () => {
    button.disabled = true;
    button.textContent = "正在前往安全登入…";
    location.href = `/api/auth/authorize?returnTo=${encodeURIComponent(returnTo)}`;
  });

  fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" })
    .then(async response => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.user) throw new Error("UNAUTHORIZED");
      setStatus(`已登入：${result.user.email}，正在開啟資料…`, "success");
      location.replace(returnTo);
    })
    .catch(() => {
      if (authResult === "forbidden") {
        showLogin("這個帳號不在允許名單中，請改用已授權的 Vercel 帳號。", "error");
      } else if (["failed", "invalid", "denied"].includes(authResult || "")) {
        showLogin("剛才的登入未完成，請再試一次。", "error");
      } else {
        showLogin("目前尚未登入，因此店務資料保持空白。", "waiting");
      }
    });
})();
