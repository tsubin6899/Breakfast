(() => {
  "use strict";

  const path = location.pathname.toLowerCase();
  const items = [
    { key: "home", href: "/", icon: "今", label: "今日" },
    { key: "accounting", href: "/accounting/", icon: "帳", label: "記帳" },
    { key: "salary", href: "/salary_app/", icon: "薪", label: "薪資" },
    { key: "analytics", href: "/dashboard_cost/", icon: "析", label: "報表" },
    { key: "settings", href: "/accounting/#safety", icon: "設", label: "設定" }
  ];

  function currentKey() {
    if (path.startsWith("/accounting/")) return location.hash === "#safety" ? "settings" : "accounting";
    if (path.startsWith("/salary_app/")) return "salary";
    if (path.startsWith("/dashboard_cost/")) return "analytics";
    return "home";
  }

  function mount() {
    if (document.querySelector(".operations-mobile-dock")) return;
    const nav = document.createElement("nav");
    nav.className = "operations-mobile-dock";
    nav.setAttribute("aria-label", "營運系統快速導覽");
    const active = currentKey();
    nav.innerHTML = items.map(item => `<a href="${item.href}"${item.key === active ? ' aria-current="page"' : ""}><i aria-hidden="true">${item.icon}</i><span>${item.label}</span></a>`).join("");
    document.body.appendChild(nav);
    document.body.classList.add("has-operations-mobile-dock");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
