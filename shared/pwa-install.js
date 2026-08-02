(() => {
  "use strict";
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let installPrompt = null;
  let installButton = null;

  function addStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .breakfast-install-app{position:fixed;z-index:9999;right:max(16px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom));display:flex;align-items:center;gap:8px;min-height:46px;padding:10px 16px;border:1px solid rgba(255,255,255,.35);border-radius:999px;color:#fff;background:linear-gradient(135deg,#0e4b86,#1766a5);box-shadow:0 12px 30px rgba(8,52,95,.28);font:800 14px/1 "Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;cursor:pointer}
      .breakfast-install-app::before{content:"＋";display:grid;width:24px;height:24px;place-items:center;border-radius:8px;color:#0e4b86;background:#ffd20a;font-size:17px}
      .breakfast-install-app:hover{transform:translateY(-1px)}
      @media(max-width:860px){body.salary-system .breakfast-install-app,body.accounting-system .breakfast-install-app,body.analytics-system .breakfast-install-app{right:12px;bottom:calc(86px + env(safe-area-inset-bottom));min-height:44px;padding:9px 13px;font-size:13px}}
      @media(display-mode:standalone){.breakfast-install-app{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function showButton() {
    if (isStandalone || installButton) return;
    addStyles();
    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.className = "breakfast-install-app";
    installButton.textContent = "安裝初一食午 APP";
    installButton.setAttribute("aria-label", "將初一食午營運管理系統安裝到這台裝置");
    installButton.addEventListener("click", async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        installButton?.remove();
        installButton = null;
        return;
      }
      if (isIos) {
        window.alert("請點 Safari 下方的「分享」按鈕，再選擇「加入主畫面」，即可安裝初一食午 APP。");
      }
    });
    document.body.appendChild(installButton);
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations
          .filter(item => new URL(item.scope).pathname.startsWith("/salary_app/"))
          .map(item => item.unregister()));
        await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      } catch (error) {
        console.warn("PWA registration failed", error);
      }
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    showButton();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton?.remove();
    installButton = null;
  });
  if (isIos && !isStandalone) window.addEventListener("DOMContentLoaded", showButton);
})();
