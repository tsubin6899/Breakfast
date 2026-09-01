(() => {
  "use strict";

  const path = location.pathname.toLowerCase();
  const icon = name => window.BreakfastIcons?.svg(name) || "";
  const items = [
    { key: "ledger", href: "/accounting/?view=ledger", icon: icon("calendar"), label: "收支表" },
    { key: "accounting-report", href: "/accounting/?view=report", icon: icon("analytics"), label: "統計表" },
    { key: "salary", href: "/salary_app/", icon: icon("payroll"), label: "薪資" },
    { key: "analytics", href: "/dashboard_cost/", icon: icon("report"), label: "報表" },
    { key: "settings", href: "/accounting/#safety", icon: icon("settings"), label: "設定" }
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
