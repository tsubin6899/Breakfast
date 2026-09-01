(() => {
  "use strict";

  const path = location.pathname.toLowerCase();
  const icons = {
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></svg>',
    statistics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M3 20.5h18"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v4M4 6.5A2.5 2.5 0 0 0 6.5 9H20v11H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"/><path d="M16 13h4v4h-4a2 2 0 1 1 0-4Z"/></svg>',
    report: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5A7.5 7.5 0 0 1 20.5 9H15V3.5Z"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.6 4.2 10.2 2h3.6l.6 2.2 1.7 1 2.2-.6 1.8 3.1-1.6 1.6v2l1.6 1.6-1.8 3.1-2.2-.6-1.7 1-.6 2.2h-3.6l-.6-2.2-1.7-1-2.2.6-1.8-3.1 1.6-1.6v-2L3.9 7.7l1.8-3.1 2.2.6 1.7-1Z"/><circle cx="12" cy="10.3" r="2.8"/></svg>'
  };
  const items = [
    { key: "ledger", href: "/accounting/?view=ledger", icon: icons.calendar, label: "收支表" },
    { key: "accounting-report", href: "/accounting/?view=report", icon: icons.statistics, label: "統計表" },
    { key: "salary", href: "/salary_app/", icon: icons.wallet, label: "薪資" },
    { key: "analytics", href: "/dashboard_cost/", icon: icons.report, label: "報表" },
    { key: "settings", href: "/accounting/#safety", icon: icons.settings, label: "設定" }
  ];

  function currentKey() {
    if (path.startsWith("/accounting/")) {
      if (location.hash === "#safety") return "settings";
      const view = new URLSearchParams(location.search).get("view");
      if (["ledger", "today"].includes(view) || ["#ledger", "#today"].includes(location.hash)) return "ledger";
      if (view === "report" || location.hash === "#report") return "accounting-report";
      return "";
    }
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
