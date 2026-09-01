(() => {
  "use strict";

  const paths = {
    home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10v9.5h13V10M9.5 19.5v-6h5v6"/>',
    accounting: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    payroll: '<path d="M4 7.5h15.5v12H6A2 2 0 0 1 4 17.5v-10Z"/><path d="M4 8a3 3 0 0 1 3-3h10v3M15.5 12.5H21v4h-5.5a2 2 0 1 1 0-4Z"/>',
    analytics: '<path d="M4 20V11h4v9M10 20V4h4v16M16 20v-6h4v6M3 20.5h18"/>',
    dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.3"/><rect x="13.5" y="10.5" width="7" height="10" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/>',
    attendance: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2M8 2.8 5.5 5.2M16 2.8l2.5 2.4"/>',
    employees: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-3.5 2.3-5.2 5.5-5.2s5 1.7 5.5 5.2M15 6.5a2.5 2.5 0 0 1 0 5M16 14c2.5.3 3.8 2 4.2 5"/>',
    settings: '<path d="M9.7 4.2 10.3 2h3.4l.6 2.2 1.8 1 2.2-.6L20 7.5l-1.6 1.6v2l1.6 1.6-1.7 2.9-2.2-.6-1.8 1-.6 2.2h-3.4L9.7 16l-1.8-1-2.2.6L4 12.7l1.6-1.6v-2L4 7.5l1.7-2.9 2.2.6 1.8-1Z"/><circle cx="12" cy="10.1" r="2.7"/>',
    entry: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17Z"/><path d="M12 7v7M8.5 10.5h7"/>',
    calendar: '<path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="m8.5 14 2 2 4.5-5"/>',
    report: '<path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5A7.5 7.5 0 0 1 20.5 9H15V3.5Z"/>',
    import: '<path d="M12 3v11M8 7l4-4 4 4"/><path d="M5 13v6.5h14V13"/>',
    catalog: '<path d="m4 5 7-2 9 9-8 8-9-9 1-6Z"/><circle cx="7.5" cy="7.5" r="1"/><path d="m13.5 7.5 6.5 6.5-6 6"/>',
    safety: '<path d="M12 2.5 19 5v5.4c0 4.4-2.5 7.6-7 9.6-4.5-2-7-5.2-7-9.6V5l7-2.5Z"/><path d="m8.5 11.5 2.2 2.2 4.8-5"/>',
    trend: '<path d="M4 19V5M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/>',
    costs: '<path d="M4 19.5h16M6 17V9h3v8M11 17V5h3v12M16 17v-5h3v5"/><path d="M5 5.5h4"/>',
    channels: '<path d="M3.5 10h17l-1.5-5H5l-1.5 5Z"/><path d="M5 10v9.5h14V10M9 19.5v-5h6v5"/><path d="M4 10a2.5 2.5 0 0 0 4 2 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4 0 2.5 2.5 0 0 0 4-2"/>',
    planning: '<path d="M4 18.5h16M5.5 16l4-4 3 2 6-7"/><path d="M15.5 7H19v3.5"/><circle cx="5.5" cy="16" r="1"/>',
    alerts: '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 8.5v5M12 17h.01"/>',
    today: '<path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="M8 12h8M8 16h5"/>',
    ai: '<path d="M7 3H4v3M17 3h3v3M7 21H4v-3M17 21h3v-3"/><rect x="7" y="7" width="10" height="10" rx="3"/><path d="M10 11h.01M14 11h.01M10 14h4"/>',
    cloud: '<path d="M7.5 18.5H18a4 4 0 0 0 .4-8A6.5 6.5 0 0 0 6 9.5a4.5 4.5 0 0 0 1.5 9Z"/><path d="m9 14 3-3 3 3M12 11v7"/>',
    refresh: '<path d="M19 8V4l-2 2a8 8 0 1 0 2.2 8"/><path d="M19 4h-4"/>',
    year: '<path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="M8 12h2M12 12h4M8 16h3M13 16h3"/>',
    month: '<path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><rect x="8" y="11" width="8" height="6" rx="1"/>',
    week: '<path d="M6.5 3v3M17.5 3v3M4 8.5h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z"/><path d="M7 13h10M7 16h7"/>'
  };

  function svg(name) {
    const body = paths[name] || paths.dashboard;
    return `<svg class="operations-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  function mount(root = document) {
    root.querySelectorAll("[data-icon]").forEach(element => {
      const name = element.dataset.icon;
      if (!paths[name] || element.dataset.iconMounted === "true") return;
      element.innerHTML = svg(name);
      element.dataset.iconMounted = "true";
    });
  }

  window.BreakfastIcons = { svg, mount, names: Object.keys(paths) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => mount(), { once: true });
  else mount();
})();
