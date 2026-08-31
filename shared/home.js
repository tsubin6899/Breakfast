(() => {
  "use strict";

  const REQUIRED_INCOME = ["快一點line pay收入", "現金營業收入", "line Pay經營收入", "Uber eat外送", "Foodpanda外送"];
  const money = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
  const $ = selector => document.querySelector(selector);
  let latestSummary = null;
  let toastTimer = 0;

  function safeJson(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function todayDate() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  }

  function previousMonth(month) {
    const [year, value] = month.split("-").map(Number);
    const date = new Date(year, value - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function canonicalIncome(value) {
    const text = String(value || "").trim();
    const key = text.toLowerCase().replace(/[\s_\-]/g, "");
    if (/uber/.test(key)) return "Uber eat外送";
    if (/foodpanda|熊貓/.test(key)) return "Foodpanda外送";
    if (/快一點/.test(key)) return "快一點line pay收入";
    if (/linepay|line收入/.test(key)) return "line Pay經營收入";
    if (/現金/.test(key)) return "現金營業收入";
    return text;
  }

  function localSummary(month) {
    const accounting = safeJson("breakfast-accounting-v1", {}) || {};
    const payroll = safeJson("breakfast-payroll-v1", {}) || {};
    const transactions = Array.isArray(accounting.transactions) ? accounting.transactions : [];
    const rows = transactions.filter(item => String(item.date || "").startsWith(month));
    const previousRows = transactions.filter(item => String(item.date || "").startsWith(previousMonth(month)));
    const storedSummary = accounting.localSummaries?.[month];
    const previousStoredSummary = accounting.localSummaries?.[previousMonth(month)];
    const income = storedSummary ? number(storedSummary.income) : rows.filter(item => item.type === "income").reduce((sum, item) => sum + number(item.amount), 0);
    const expense = storedSummary ? number(storedSummary.expense) : rows.filter(item => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0);
    const dayLabor = (Array.isArray(accounting.dayLabor) ? accounting.dayLabor : []).filter(item => String(item.date || "").startsWith(month)).reduce((sum, item) => sum + number(item.amount || item.dailyWage), 0);
    const expenseGroups = new Map();
    if (storedSummary?.expenseGroups) Object.entries(storedSummary.expenseGroups).forEach(([name, amount]) => expenseGroups.set(name, number(amount)));
    else rows.filter(item => item.type === "expense").forEach(item => expenseGroups.set(item.group || "其他支出", (expenseGroups.get(item.group || "其他支出") || 0) + number(item.amount)));
    const today = todayDate();
    const shopClosed = Boolean(accounting.shopClosures?.[today]);
    const summarizedIncomeItems = storedSummary?.incomeItemsByDay?.[today.slice(8, 10)] || [];
    const recorded = new Set((summarizedIncomeItems.length ? summarizedIncomeItems : rows.filter(item => item.type === "income" && item.date === today && number(item.amount) > 0).map(item => item.category || item.counterparty || item.group)).map(canonicalIncome));
    const missingToday = month === today.slice(0, 7) && !shopClosed ? REQUIRED_INCOME.filter(item => !recorded.has(item)) : [];
    const reconciliations = Object.values(accounting.reconciliations || {});
    const unresolved = reconciliations.filter(item => String(item?.date || "").startsWith(month) && Math.abs(number(item?.difference)) > 1).length;
    const unclassified = storedSummary ? number(storedSummary.unclassified) : rows.filter(item => !item.group || !item.category || /未分類/.test(`${item.group || ""}${item.category || ""}`)).length;
    const attendance = Object.values(payroll.attendance || {});
    const activeEmployees = (payroll.employees || []).filter(item => item.active !== false);
    const birthdayEmployees = activeEmployees.filter(item => String(item.birthday || "").slice(5, 7) === month.slice(5, 7));
    const anniversaryEmployees = activeEmployees.filter(item => String(item.hireDate || "").slice(5, 7) === month.slice(5, 7));
    const openPayables = (accounting.payables || []).filter(item => item.status !== "paid");
    const overduePayables = openPayables.filter(item => item.dueDate && item.dueDate < today);
    const closure = payroll.closedMonths?.[month] || {};
    const payrollRows = Array.isArray(closure?.snapshot?.rows) ? closure.snapshot.rows : [];
    const audit = [...(accounting.auditLog || []), ...(payroll.auditLog || [])].sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || ""))).slice(0, 8);
    const store = window.BreakfastOperationsStore?.read();
    const accountingCloudMeta = safeJson("breakfast-accounting-cloud-meta-v1", {}) || {};
    const payrollCloudMeta = safeJson("breakfast-payroll-cloud-meta-v1", {}) || {};
    return {
      month,
      accounting: {
        income,
        expense: expense + dayLabor,
        net: income - expense - dayLabor,
        transactionCount: storedSummary ? number(storedSummary.transactionCount) : rows.length,
        missingToday,
        shopClosed,
        unresolvedReconciliations: unresolved,
        unclassified,
        budgets: accounting.budgets?.[month] || {},
        previousExpense: previousStoredSummary ? number(previousStoredSummary.expense) : previousRows.filter(item => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0),
        expenseGroups: [...expenseGroups.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }))
      },
      payroll: {
        employeeCount: activeEmployees.length,
        pendingAttendance: attendance.filter(item => String(item?.date || "").startsWith(month) && item?.status !== "confirmed").length,
        birthdays: birthdayEmployees.map(item => ({ name: item.name, date: item.birthday, gift: number(item.birthdayGiftAmount ?? 1000) })),
        anniversaries: anniversaryEmployees.map(item => ({ name: item.name, date: item.hireDate })),
        locked: closure.locked === true,
        total: payrollRows.reduce((sum, item) => sum + number(item.total), 0)
      },
      payables: { open: openPayables.length, overdue: overduePayables.length, amount: openPayables.reduce((sum, item) => sum + number(item.amount), 0) },
      sync: {
        accounting: {
          updatedAt: accountingCloudMeta.lastSuccessAt || store?.modules?.accounting?.updatedAt || "",
          lastSuccessAt: accountingCloudMeta.lastSuccessAt || "",
          lastLocalChangeAt: accountingCloudMeta.lastLocalChangeAt || "",
          dirty: accountingCloudMeta.dirty === true,
          revision: accountingCloudMeta.revision || "",
          updatedBy: "本機同步紀錄"
        },
        payroll: {
          updatedAt: payrollCloudMeta.lastSuccessAt || store?.modules?.payroll?.updatedAt || "",
          lastSuccessAt: payrollCloudMeta.lastSuccessAt || "",
          lastLocalChangeAt: payrollCloudMeta.lastLocalChangeAt || "",
          dirty: payrollCloudMeta.dirty === true,
          revision: payrollCloudMeta.revision || "",
          updatedBy: "本機同步紀錄"
        }
      },
      services: { geminiConfigured: null, cloudStorageConfigured: null },
      audit
    };
  }

  function mergeSummary(local, cloud) {
    if (!cloud) return local;
    const hasLocalAccounting = number(local.accounting.transactionCount) > 0;
    const hasLocalPayroll = number(local.payroll.employeeCount) > 0;
    return {
      ...cloud,
      accounting: hasLocalAccounting ? { ...cloud.accounting, ...local.accounting } : cloud.accounting,
      payroll: hasLocalPayroll ? { ...cloud.payroll, ...local.payroll } : cloud.payroll,
      payables: local.payables || cloud.payables,
      sync: {
        accounting: mergeSyncItem(local.sync?.accounting, cloud.sync?.accounting),
        payroll: mergeSyncItem(local.sync?.payroll, cloud.sync?.payroll)
      },
      audit: local.audit?.length ? local.audit : cloud.audit
    };
  }

  function mergeSyncItem(localItem = {}, cloudItem = {}) {
    return {
      ...cloudItem,
      ...localItem,
      updatedAt: localItem.lastSuccessAt || cloudItem.updatedAt || localItem.updatedAt || "",
      updatedBy: cloudItem.updatedBy || localItem.updatedBy || "",
      dirty: localItem.dirty === true
    };
  }

  function relativeTime(value) {
    const timestamp = Date.parse(value || "");
    if (!Number.isFinite(timestamp)) return "尚未同步";
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "剛剛";
    if (minutes < 60) return `${minutes} 分鐘前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
    return `${Math.floor(minutes / 1440)} 天前`;
  }

  function percent(value, total) {
    return total > 0 ? Math.round(value / total * 100) : 0;
  }

  function render(summary, source = "local") {
    latestSummary = summary;
    const accounting = summary.accounting || {};
    const payroll = summary.payroll || {};
    const monthLabel = `${Number(summary.month.slice(0, 4))} 年 ${Number(summary.month.slice(5))} 月`;
    const expenseRatio = percent(accounting.expense, accounting.income);
    $("#home-greeting").textContent = accounting.missingToday?.length || payroll.pendingAttendance ? "今天有幾件事需要先處理。" : "今天的店務狀態很穩定。";
    $("#home-subtitle").textContent = `${monthLabel}・收入支出比 ${accounting.income ? `${expenseRatio}%` : "尚無資料"}・${source === "cloud" ? "已核對雲端摘要" : "顯示本機最新資料"}`;
    $("#home-cloud-state").className = `home-status ${source === "cloud" ? "is-ready" : "is-local"}`;
    $("#home-cloud-state").innerHTML = `<i></i>${source === "cloud" ? "雲端已連線" : "本機資料"}`;

    $("#home-kpis").innerHTML = [
      ["income", "本月收入", money.format(number(accounting.income)), `${number(accounting.transactionCount).toLocaleString("zh-TW")} 筆收支紀錄`],
      ["expense", "本月支出", money.format(number(accounting.expense)), `占收入 ${expenseRatio}%`],
      ["net", "目前淨額", money.format(number(accounting.net)), number(accounting.net) >= 0 ? "維持正向" : "目前支出高於收入"],
      ["people", "出勤與薪資", `${number(payroll.employeeCount)} 人`, payroll.locked ? `已月結・${money.format(number(payroll.total))}` : `${number(payroll.pendingAttendance)} 筆待確認`]
    ].map(([tone, label, value, note]) => `<article class="kpi-card ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join("");

    const actions = [];
    if (accounting.shopClosed) actions.push({ tone: "good", icon: "休", title: "今天已標記店休", detail: "固定收入不列入漏記檢查。", href: "/accounting/#today", link: "查看日曆" });
    else if (accounting.missingToday?.length) actions.push({ tone: "danger", icon: "帳", title: `今天漏記 ${accounting.missingToday.length} 項固定收入`, detail: accounting.missingToday.join("、"), href: "/accounting/#today", link: "立即補記" });
    if (payroll.pendingAttendance) actions.push({ tone: "warning", icon: "卡", title: `${payroll.pendingAttendance} 筆打卡仍待人工確認`, detail: "待確認紀錄不會納入薪資。", href: "/salary_app/#attendance", link: "前往核對" });
    if (accounting.unresolvedReconciliations) actions.push({ tone: "danger", icon: "核", title: `${accounting.unresolvedReconciliations} 天對帳仍有差額`, detail: "請確認漏登、平台入帳時間差或現金差異。", href: "/accounting/#ledger", link: "處理差額" });
    if (accounting.unclassified) actions.push({ tone: "warning", icon: "類", title: `${accounting.unclassified} 筆收支尚未正確分類`, detail: "完成分類後供應商與成本分析會更準確。", href: "/accounting/#catalog", link: "整理分類" });
    if (summary.payables?.overdue) actions.push({ tone: "danger", icon: "付", title: `${summary.payables.overdue} 筆應付帳款已逾期`, detail: `目前共有 ${summary.payables.open} 筆待付、合計 ${money.format(number(summary.payables.amount))}。`, href: "/accounting/", link: "前往付款" });
    if (payroll.birthdays?.length) actions.push({ tone: "good", icon: "禮", title: `${monthLabel}有 ${payroll.birthdays.length} 位員工生日`, detail: payroll.birthdays.map(item => `${item.name} ${String(item.date).slice(5).replace("-", "/")}・${money.format(item.gift)}`).join("、"), href: "/salary_app/#employees", link: "查看員工" });
    if (payroll.anniversaries?.length) actions.push({ tone: "good", icon: "年", title: `${monthLabel}有 ${payroll.anniversaries.length} 位到職週年`, detail: payroll.anniversaries.map(item => `${item.name} ${String(item.date).slice(5).replace("-", "/")}`).join("、"), href: "/salary_app/#employees", link: "查看年資" });
    if (!payroll.locked) actions.push({ tone: "warning", icon: "薪", title: `${monthLabel}薪資尚未鎖定月結`, detail: "完成核對、試算與核准後再鎖定。", href: "/salary_app/#payroll", link: "查看薪資" });
    const pendingSync = Object.values(summary.sync || {}).filter(item => item?.dirty).length;
    if (pendingSync) actions.push({ tone: "warning", icon: "雲", title: `${pendingSync} 個模組有資料等待同步`, detail: navigator.onLine ? "網路正常，系統將自動重試；也可以進入同步中心立即處理。" : "目前離線，資料已安全保留在本機。", href: "/accounting/#safety", link: "同步狀態" });
    const staleSync = Object.values(summary.sync || {}).filter(item => item?.revision && !item?.dirty && (!item?.lastSuccessAt || Date.now() - Date.parse(item.lastSuccessAt) > 24 * 60 * 60 * 1000)).length;
    if (!pendingSync && staleSync) actions.push({ tone: "warning", icon: "備", title: `${staleSync} 個模組超過 24 小時未成功備份`, detail: "請開啟同步中心確認網路、登入狀態與最新雲端版本。", href: "/accounting/#safety", link: "檢查備份" });
    if (summary.services?.geminiConfigured === false) actions.push({ tone: "danger", icon: "AI", title: "AI 打卡辨識尚未設定", detail: "請在雲端環境設定 Gemini 或 OpenAI 金鑰。", href: "/salary_app/#attendance", link: "查看打卡" });
    if (!actions.length) actions.push({ tone: "good", icon: "✓", title: "目前沒有高優先待辦", detail: "固定收入、出勤與對帳狀態正常。", href: "/accounting/", link: "開始記帳" });
    $("#home-action-count").textContent = `${actions.filter(item => item.tone !== "good").length} 項`;
    $("#home-actions").innerHTML = actions.map(item => `<article class="action-item ${item.tone}"><i>${item.icon}</i><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><a href="${item.href}">${item.link} →</a></article>`).join("");

    const budgets = accounting.budgets || {};
    const budgetRows = [];
    if (number(budgets.targetIncome) > 0) budgetRows.push({ name: "收入目標", actual: number(accounting.income), budget: number(budgets.targetIncome), inverse: false });
    if (number(budgets.targetExpense) > 0) budgetRows.push({ name: "支出上限", actual: number(accounting.expense), budget: number(budgets.targetExpense), inverse: true });
    Object.entries(budgets.groups || {}).forEach(([name, value]) => {
      const actual = (accounting.expenseGroups || []).find(item => item.name === name)?.amount || 0;
      if (number(value) > 0) budgetRows.push({ name, actual, budget: number(value), inverse: true });
    });
    $("#home-budget").innerHTML = budgetRows.length ? budgetRows.slice(0, 7).map(row => {
      const ratio = percent(row.actual, row.budget);
      const tone = row.inverse ? (ratio > 100 ? "is-over" : ratio >= 85 ? "is-warning" : "") : (ratio >= 100 ? "" : ratio >= 80 ? "is-warning" : "");
      return `<div class="budget-row ${tone}"><div><span>${escapeHtml(row.name)}</span><span>${money.format(row.actual)}／${money.format(row.budget)}</span></div><div class="budget-track" style="--progress:${Math.min(100, ratio)}%"><i></i></div></div>`;
    }).join("") : '<p class="empty-copy">尚未設定本月預算。設定收入目標與各類成本上限後，系統會主動提醒。</p>';

    const services = summary.services || {};
    $("#home-health-mini").innerHTML = [
      [navigator.onLine, navigator.onLine ? "網路正常" : "目前離線"],
      [services.cloudStorageConfigured !== false, services.cloudStorageConfigured === null ? "本機模式" : "私有雲端"],
      [services.geminiConfigured !== false, services.geminiConfigured === null ? "AI 狀態待雲端確認" : "AI 辨識已設定"]
    ].map(([ok, label]) => `<span class="${ok ? "is-good" : "is-bad"}">${ok ? "✓" : "!"} ${label}</span>`).join("");

    const syncRows = [
      ["帳", "記帳資料", summary.sync?.accounting, "/accounting/#safety"],
      ["薪", "薪資資料", summary.sync?.payroll, "/salary_app/#settings"]
    ];
    $("#home-sync").innerHTML = syncRows.map(([icon, label, item, href]) => {
      const pending = item?.dirty === true;
      const stale = !item?.updatedAt || Date.now() - Date.parse(item.updatedAt) > 24 * 60 * 60 * 1000;
      const stateLabel = pending ? "等待同步" : stale ? "請確認同步" : "同步正常";
      const detail = pending
        ? `${navigator.onLine ? "本機變更尚未上傳" : "目前離線，變更已保留"}・最後成功 ${relativeTime(item?.lastSuccessAt || item?.updatedAt)}`
        : `${relativeTime(item?.updatedAt)}${item?.updatedBy ? `・${escapeHtml(item.updatedBy)}` : ""}`;
      return `<article class="sync-item ${pending || stale ? "is-warning" : "is-good"}"><i>${icon}</i><div><strong>${label}・${stateLabel}</strong><small>${detail}</small></div><a href="${href}">${pending ? "處理" : "查看"} →</a></article>`;
    }).join("");

    $("#home-audit").innerHTML = summary.audit?.length ? summary.audit.map(item => `<article class="audit-item"><div><strong>${escapeHtml(item.action || "更新資料")}</strong><small>${escapeHtml(item.detail || "")}</small></div><time>${relativeTime(item.timestamp || item.createdAt)}</time></article>`).join("") : '<p class="empty-copy">尚無可顯示的最近操作。</p>';
  }

  async function load() {
    const month = $("#home-month").value;
    const local = localSummary(month);
    render(local, "local");
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
    try {
      const response = await fetch(`/api/operations-summary?month=${encodeURIComponent(month)}`, { credentials: "same-origin", cache: "no-store" });
      const cloud = await response.json().catch(() => null);
      if (!response.ok || !cloud) throw new Error(cloud?.message || "CLOUD_SUMMARY_FAILED");
      render(mergeSummary(local, cloud), "cloud");
    } catch (error) {
      $("#home-cloud-state").className = "home-status is-error";
      $("#home-cloud-state").innerHTML = "<i></i>雲端摘要暫時無法讀取";
      console.warn("Unable to load operations summary", error);
    }
  }

  function toast(message) {
    const element = $("#home-toast");
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove("is-visible"), 2400);
  }

  function init() {
    const fallback = todayDate().slice(0, 7);
    $("#home-month").value = window.BreakfastOperationsStore?.getGlobalMonth(fallback) || fallback;
    $("#home-month").addEventListener("change", () => {
      window.BreakfastOperationsStore?.setGlobalMonth($("#home-month").value, "home");
      load();
    });
    $("#home-refresh").addEventListener("click", async () => { await load(); toast("店務摘要已重新整理。"); });
    window.addEventListener("online", load);
    window.addEventListener("offline", () => latestSummary && render(latestSummary, "local"));
    window.BreakfastOperationsStore?.subscribe(() => load());
    load();
  }

  Promise.resolve(window.breakfastAuthReady).finally(init);
})();
