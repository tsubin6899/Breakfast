(() => {
  "use strict";

  const ACCOUNTING_KEY = "breakfast-accounting-v1";
  const PAYROLL_KEY = "breakfast-payroll-v1";
  const PAYROLL_BRIDGE_KEY = "breakfast-payroll-summary-v1";
  const ACCOUNTING_BRIDGE_KEY = "breakfast-accounting-summary-v1";
  const ANALYSIS_SETTINGS_KEY = "breakfast-analysis-settings-v1";
  const ACCOUNTING_CLOUD_META_KEY = "breakfast-accounting-cloud-meta-v1";
  const ACCOUNTING_HISTORIES = [
    window.BREAKFAST_ACCOUNTING_HISTORY_2022_2025,
    window.BREAKFAST_ACCOUNTING_HISTORY_2026,
    window.BREAKFAST_ACCOUNTING_BACKUP_2026_07_22,
    window.BREAKFAST_UBER_STATEMENT_2026_07_24
  ].filter(Boolean);
  const SALARY_HISTORIES = [
    window.BREAKFAST_SALARY_HISTORY_2022_2025,
    window.BREAKFAST_SALARY_HISTORY_2026_H1
  ].filter(Boolean);
  const HISTORY = {
    id: "accounting-sources-2022-2026-combined-v3",
    source: ACCOUNTING_HISTORIES.map(item => item.source).filter(Boolean).join("＋"),
    importedThrough: ACCOUNTING_HISTORIES.map(item => item.importedThrough || "").sort().at(-1) || "",
    transactions: ACCOUNTING_HISTORIES.flatMap(item => item.transactions || []),
    reconciliation: ACCOUNTING_HISTORIES.flatMap(item => item.reconciliation || [])
  };
  const SALARY_HISTORY = { payroll: Object.assign({}, ...SALARY_HISTORIES.map(item => item.payroll || {})) };
  const $ = selector => document.querySelector(selector);
  const moneyFormat = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });
  const compactFormat = new Intl.NumberFormat("zh-TW", { notation: "compact", maximumFractionDigits: 1 });
  const COLORS = ["#257058", "#2f6f9f", "#c67c27", "#b84f55", "#7e9f4f", "#7864a6", "#4a9da4", "#9a6a45"];
  const COST_COLORS = {
    "食材成本": "#c67c27",
    "人事成本": "#2f6f9f",
    "固定成本": "#7864a6",
    "飲品成本": "#257058",
    "雜貨成本": "#b84f55",
    "其他支出": "#7b8580"
  };
  const DEFAULT_ANALYSIS_SETTINGS = { foodRate: 35, laborRate: 30, fixedRate: 15 };

  let accounting = loadAccounting();
  let analysisSettings = { ...DEFAULT_ANALYSIS_SETTINGS, ...(safeJson(ANALYSIS_SETTINGS_KEY) || {}) };
  let toastTimer;
  let html2CanvasPromise;

  function safeJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function showToast(message, tone = "") {
    const element = $("#toast");
    element.textContent = message;
    element.className = `toast is-visible ${tone}`.trim();
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { element.className = "toast"; }, 3000);
  }

  async function refreshAnalysisFromCloud() {
    try {
      const sessionResponse = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const session = await sessionResponse.json().catch(() => ({}));
      if (!session.user) return;
      const accountingMeta = safeJson(ACCOUNTING_CLOUD_META_KEY) || {};
      const [accountingResponse, payrollResponse] = await Promise.all([
        accountingMeta.dirty ? null : fetch("/api/operations-state", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/payroll-state", { credentials: "same-origin", cache: "no-store" })
      ]);
      if (accountingResponse?.ok) {
        const remote = await accountingResponse.json();
        if (remote.state) {
          await window.BreakfastOperationsStore?.createSnapshot("accounting", safeJson(ACCOUNTING_KEY), {
            label: "分析頁載入雲端資料前快照",
            reason: `雲端版本 ${remote.revision || "未知"}`
          }).catch(() => null);
          localStorage.setItem(ACCOUNTING_KEY, JSON.stringify(remote.state));
          localStorage.setItem(ACCOUNTING_CLOUD_META_KEY, JSON.stringify({ revision: remote.revision || "", dirty: false, updatedAt: remote.updatedAt || "" }));
        }
      }
      if (payrollResponse.ok) {
        const remote = await payrollResponse.json();
        if (remote.state) localStorage.setItem(PAYROLL_KEY, JSON.stringify(remote.state));
      }
      renderFilters();
      render();
      showToast(accountingMeta.dirty ? "本機記帳尚未同步，分析暫時保留本機資料。" : "已載入 Vercel 雲端最新資料。", accountingMeta.dirty ? "" : "success");
    } catch (error) {
      console.warn("Unable to refresh analysis cloud data", error);
    }
  }

  function exportPeriodLabel() {
    const year = $("#year-filter").selectedOptions[0]?.textContent?.trim() || "目前年度";
    const month = $("#month-filter").selectedOptions[0]?.textContent?.trim() || "全年";
    return month.startsWith("全年") ? `${year}全年` : `${year}${month}`;
  }

  function exportStylesheetText() {
    return [...document.styleSheets].map(sheet => {
      try { return [...sheet.cssRules].map(rule => rule.cssText).join("\n"); }
      catch { return ""; }
    }).join("\n");
  }

  function loadHtml2Canvas() {
    if (typeof window.html2canvas === "function") return Promise.resolve(window.html2canvas);
    if (html2CanvasPromise) return html2CanvasPromise;
    html2CanvasPromise = new Promise(resolvePromise => {
      const script = document.createElement("script");
      const finish = () => resolvePromise(typeof window.html2canvas === "function" ? window.html2canvas : null);
      const timer = window.setTimeout(finish, 4000);
      script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      script.async = true;
      script.onload = () => { window.clearTimeout(timer); finish(); };
      script.onerror = () => { window.clearTimeout(timer); finish(); };
      document.head.appendChild(script);
    });
    return html2CanvasPromise;
  }

  async function captureWithForeignObject(element, width, height) {
    const markup = new XMLSerializer().serializeToString(element);
    const css = exportStylesheetText().replaceAll("&", "&amp;").replaceAll("<", "&lt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${css}</style>${markup}</div></foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      await new Promise((resolvePromise, reject) => {
        image.onload = resolvePromise;
        image.onerror = () => reject(new Error("SVG_CAPTURE_FAILED"));
        image.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const context = canvas.getContext("2d");
      context.scale(2, 2);
      context.fillStyle = "#fffdf8";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function captureChartPanel(panel, requestedWidth) {
    const width = Math.max(requestedWidth, Math.ceil(panel.getBoundingClientRect().width));
    const stage = document.createElement("div");
    stage.className = "export-stage";
    stage.style.width = `${width}px`;
    const clone = panel.cloneNode(true);
    clone.classList.add("is-export-copy");
    clone.style.width = `${width}px`;
    clone.querySelectorAll(".export-chart").forEach(button => button.remove());
    const period = document.createElement("p");
    period.className = "export-period";
    period.textContent = `分析期間：${exportPeriodLabel()}・匯出日期：${new Date().toLocaleDateString("zh-TW")}`;
    clone.querySelector(".panel-heading")?.insertAdjacentElement("afterend", period);
    stage.appendChild(clone);
    document.body.appendChild(stage);
    try {
      const height = Math.ceil(clone.getBoundingClientRect().height);
      const html2Canvas = await loadHtml2Canvas();
      if (html2Canvas) {
        return await html2Canvas(clone, {
          scale: 2,
          backgroundColor: "#fffdf8",
          useCORS: true,
          logging: false,
          width,
          height,
          windowWidth: width,
          windowHeight: height
        });
      }
      return await captureWithForeignObject(clone, width, height);
    } finally {
      stage.remove();
    }
  }

  function saveCanvasAsJpg(canvas, filename) {
    return new Promise((resolvePromise, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("JPG_CREATE_FAILED")); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolvePromise();
      }, "image/jpeg", .94);
    });
  }

  async function exportChart(event) {
    const button = event.currentTarget;
    const panel = button.closest(".chart-panel");
    if (!panel || button.disabled) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = "製作中…";
    try {
      const canvas = await captureChartPanel(panel, Number(button.dataset.exportWidth || 760));
      const safePeriod = exportPeriodLabel().replace(/[^0-9A-Za-z\u4e00-\u9fff-]+/g, "_");
      const date = new Date().toISOString().slice(0, 10);
      await saveCanvasAsJpg(canvas, `初一食午_${button.dataset.filename}_${safePeriod}_${date}.jpg`);
      showToast("圖表已儲存成 JPG。", "success");
    } catch (error) {
      console.error("Unable to export chart", error);
      showToast("目前無法產生 JPG，請重新整理後再試一次。", "error");
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  function loadAccounting() {
    const saved = safeJson(ACCOUNTING_KEY);
    if (!saved) return { transactions: HISTORY.transactions || [], dayLabor: [] };
    const transactions = Array.isArray(saved.transactions) ? [...saved.transactions] : [];
    if (HISTORY.id && !saved.importedSources?.[HISTORY.id]) {
      const ids = new Set(transactions.map(item => item.id));
      for (const item of HISTORY.transactions || []) if (!ids.has(item.id)) transactions.push(item);
    }
    return { ...saved, transactions, dayLabor: Array.isArray(saved.dayLabor) ? saved.dayLabor : [] };
  }

  function money(value) { return moneyFormat.format(Number(value) || 0); }
  function compact(value) { return `$${compactFormat.format(Number(value) || 0)}`; }
  function pct(value) { return `${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format((Number(value) || 0) * 100)}%`; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function sumRows(rows) { return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.total || 0), 0); }

  function payrollForMonth(month) {
    const bridge = safeJson(PAYROLL_BRIDGE_KEY);
    if (bridge?.months?.[month]) return { amount: Number(bridge.months[month].total || 0), source: bridge.months[month].source || "薪資管理 APP", ready: true };
    const payrollState = safeJson(PAYROLL_KEY);
    const snapshot = payrollState?.closedMonths?.[month]?.snapshot?.rows;
    if (Array.isArray(snapshot)) return { amount: sumRows(snapshot), source: "薪資管理・鎖定月結", ready: true };
    const bundled = SALARY_HISTORY.payroll?.[month];
    if (Array.isArray(bundled)) return { amount: sumRows(bundled), source: `${month.slice(0, 4)} 工資簿匯入快照`, ready: true };
    return { amount: 0, source: "尚無正式薪資資料", ready: false };
  }

  function monthStats(month) {
    const transactions = accounting.transactions.filter(item => item.date?.startsWith(month));
    const incomeRows = transactions.filter(item => item.type === "income");
    const expenseRows = transactions.filter(item => item.type === "expense");
    const income = incomeRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const operating = expenseRows.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const payroll = payrollForMonth(month);
    const labor = accounting.dayLabor.filter(item => item.date?.startsWith(month)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expenses = operating + payroll.amount + labor;
    return { month, transactions, incomeRows, expenseRows, income, operating, payroll, labor, expenses, net: income - expenses };
  }

  function availableMonths() {
    const months = new Set();
    accounting.transactions.forEach(item => { if (/^\d{4}-(0[1-9]|1[0-2])/.test(item.date || "")) months.add(item.date.slice(0, 7)); });
    accounting.dayLabor.forEach(item => { if (/^\d{4}-(0[1-9]|1[0-2])/.test(item.date || "")) months.add(item.date.slice(0, 7)); });
    Object.keys(SALARY_HISTORY.payroll || {}).forEach(month => months.add(month));
    return [...months].sort();
  }

  function selectedMonths() {
    const year = $("#year-filter").value;
    const month = $("#month-filter").value;
    return availableMonths().filter(value => value.startsWith(`${year}-`) && (!month || value === `${year}-${month}`));
  }

  function selectedStats() { return selectedMonths().map(monthStats); }
  function drilldownMonth() {
    const months = selectedMonths();
    return months.at(-1) || "";
  }

  function accountingUrl({ month = drilldownMonth(), type = "", search = "", date = "" } = {}) {
    const query = new URLSearchParams();
    if (month) query.set("month", month);
    if (date) query.set("date", date);
    if (type && type !== "all") query.set("type", type);
    if (search) query.set("search", search);
    return `../accounting/${query.size ? `?${query}` : ""}`;
  }

  function openDrilldown(target) {
    const month = target.dataset.drilldownMonth || drilldownMonth();
    if (target.dataset.drilldownSystem === "salary") {
      window.location.href = `../salary_app/${month ? `?month=${encodeURIComponent(month)}` : ""}`;
      return;
    }
    window.location.href = accountingUrl({ month, type: target.dataset.drilldownType, search: target.dataset.drilldownSearch || "", date: target.dataset.drilldownDate || "" });
  }
  function aggregate(stats) {
    const income = stats.reduce((sum, item) => sum + item.income, 0);
    const operating = stats.reduce((sum, item) => sum + item.operating, 0);
    const payroll = stats.reduce((sum, item) => sum + item.payroll.amount, 0);
    const labor = stats.reduce((sum, item) => sum + item.labor, 0);
    const expenses = operating + payroll + labor;
    return { income, operating, payroll, labor, expenses, net: income - expenses };
  }

  function renderFilters() {
    const months = availableMonths();
    const years = [...new Set(months.map(month => month.slice(0, 4)))].sort();
    const query = new URLSearchParams(window.location.search);
    const requestedMonth = query.get("month") || "";
    const sharedMonth = window.BreakfastOperationsStore?.getGlobalMonth("") || "";
    const preferredMonth = requestedMonth || sharedMonth;
    const requestedYear = query.get("year") || preferredMonth.slice(0, 4);
    const selectedYear = years.includes(requestedYear) ? requestedYear : (years.at(-1) || String(new Date().getFullYear()));
    $("#year-filter").innerHTML = years.map(year => `<option value="${year}">${year} 年</option>`).join("");
    $("#year-filter").value = selectedYear;
    $("#month-filter").insertAdjacentHTML("beforeend", Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, "0");
      return `<option value="${value}">${index + 1} 月</option>`;
    }).join(""));
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(preferredMonth) && preferredMonth.startsWith(`${selectedYear}-`) && months.includes(preferredMonth)) {
      $("#month-filter").value = preferredMonth.slice(5);
    }
    updateMonthOptions();
  }

  function updateMonthOptions() {
    const year = $("#year-filter").value;
    const available = new Set(availableMonths().filter(month => month.startsWith(`${year}-`)).map(month => month.slice(5)));
    [...$("#month-filter").options].forEach(option => {
      if (!option.value) return;
      option.disabled = !available.has(option.value);
    });
    if ($("#month-filter").selectedOptions[0]?.disabled) $("#month-filter").value = "";
  }

  function persistFilterInUrl() {
    const url = new URL(window.location.href);
    const year = $("#year-filter").value;
    const month = $("#month-filter").value;
    url.searchParams.set("year", year);
    if (month) url.searchParams.set("month", `${year}-${month}`);
    else url.searchParams.delete("month");
    window.history.replaceState({}, "", url);
    if (month) window.BreakfastOperationsStore?.setGlobalMonth(`${year}-${month}`, "analytics");
  }

  function renderFreshness(stats) {
    const missing = stats.filter(item => !item.payroll.ready).map(item => item.month);
    const deltas = (HISTORY.reconciliation || []).filter(item => selectedMonths().includes(item.period) && Number(item.expenseDelta || 0) !== 0);
    const element = $("#freshness");
    element.classList.toggle("is-warning", missing.length > 0 || deltas.length > 0);
    element.innerHTML = `<strong>資料來源：</strong>${escapeHtml(HISTORY.source || "記帳系統")}＋薪資管理 APP。資料涵蓋至 ${escapeHtml(HISTORY.importedThrough || "本機最新紀錄")}。${missing.length ? ` ${missing.join("、")} 尚無正式薪資月結。` : " 正式薪資已成功串接。"}${deltas.length ? ` 來源檔的 ${deltas.map(item => item.period).join("、")} 年報表與每日支出明細有差異，本頁採每日明細。` : ""}`;
  }

  function dailyIncomeRows(stats) {
    const daily = new Map();
    stats.flatMap(item => item.incomeRows).forEach(item => daily.set(item.date, (daily.get(item.date) || 0) + Number(item.amount || 0)));
    return [...daily].map(([date, amount]) => ({ date, amount })).filter(item => item.amount !== 0);
  }

  function comparisonStats(kind) {
    const year = Number($("#year-filter").value);
    const month = $("#month-filter").value;
    if (month) {
      const currentDate = new Date(year, Number(month) - 1, 1);
      const target = kind === "previous"
        ? new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
        : new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1);
      const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
      return availableMonths().includes(key) ? [monthStats(key)] : [];
    }
    const targetYear = String(year - 1);
    return availableMonths().filter(value => value.startsWith(`${targetYear}-`)).map(monthStats);
  }

  function changeText(current, previous) {
    if (!previous) return { value: "—", note: "缺少比較期間資料", className: "" };
    const difference = current - previous;
    const rate = previous ? difference / previous : 0;
    return {
      value: `${difference >= 0 ? "+" : ""}${pct(rate)}`,
      note: `${difference >= 0 ? "增加" : "減少"} ${money(Math.abs(difference))}`,
      className: difference >= 0 ? "positive" : "negative"
    };
  }

  function targetMetrics(stats) {
    const total = aggregate(stats);
    const rows = stats.flatMap(item => item.expenseRows);
    const food = rows.filter(item => item.group === "食材成本").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const fixed = rows.filter(item => item.group === "固定成本").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const labor = total.payroll + total.labor;
    return [
      { key: "food", label: "食材成本", actual: food, targetRate: Number(analysisSettings.foodRate || 35) / 100 },
      { key: "labor", label: "人事成本", actual: labor, targetRate: Number(analysisSettings.laborRate || 30) / 100 },
      { key: "fixed", label: "固定成本", actual: fixed, targetRate: Number(analysisSettings.fixedRate || 15) / 100 }
    ].map(item => ({ ...item, income: total.income, budget: total.income * item.targetRate, rate: total.income ? item.actual / total.income : 0 }));
  }

  function renderTargets(stats) {
    $("#target-food-rate").value = analysisSettings.foodRate;
    $("#target-labor-rate").value = analysisSettings.laborRate;
    $("#target-fixed-rate").value = analysisSettings.fixedRate;
    $("#target-result-grid").innerHTML = targetMetrics(stats).map(item => {
      const difference = item.actual - item.budget;
      const over = difference > 0;
      return `<article class="target-result${over ? " is-over" : ""}"><span>${item.label}・目標 ${pct(item.targetRate)}</span><strong>${pct(item.rate)}</strong><small>實際 ${money(item.actual)}・預算 ${money(item.budget)}・${over ? `超出 ${money(difference)}` : `尚有 ${money(Math.abs(difference))} 空間`}</small></article>`;
    }).join("");
  }

  function renderVendorTrend(stats) {
    const currentRows = stats.flatMap(item => item.expenseRows);
    const previousRows = comparisonStats("previous").flatMap(item => item.expenseRows);
    const sumByVendor = rows => {
      const map = new Map();
      rows.forEach(item => {
        const name = item.counterparty || item.category || "未填供應商";
        map.set(name, (map.get(name) || 0) + Number(item.amount || 0));
      });
      return map;
    };
    const current = sumByVendor(currentRows);
    const previous = sumByVendor(previousRows);
    const vendors = [...new Set([...current.keys(), ...previous.keys()])]
      .map(name => ({ name, current: current.get(name) || 0, previous: previous.get(name) || 0 }))
      .sort((a, b) => b.current - a.current)
      .slice(0, 10);
    const max = Math.max(...vendors.flatMap(item => [item.current, item.previous]), 1);
    $("#vendor-trend-chart").innerHTML = vendors.length ? vendors.map(item => {
      const difference = item.current - item.previous;
      return `<article class="vendor-trend-row"><strong>${escapeHtml(item.name)}</strong><div class="vendor-trend-bars"><span style="width:${Math.max(item.current ? 2 : 0, item.current / max * 100)}%" title="目前 ${money(item.current)}"></span><span class="previous" style="width:${Math.max(item.previous ? 2 : 0, item.previous / max * 100)}%" title="比較期 ${money(item.previous)}"></span></div><b>${money(item.current)}</b><span class="vendor-change${difference > 0 ? " is-up" : ""}">${difference >= 0 ? "+" : ""}${money(difference)}</span></article>`;
    }).join("") : '<p class="empty">目前沒有供應商採購資料。</p>';
  }

  function renderKpis(stats) {
    const total = aggregate(stats);
    const daily = dailyIncomeRows(stats);
    const food = stats.flatMap(item => item.expenseRows).filter(item => item.group === "食材成本").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $("#kpi-income").textContent = money(total.income);
    $("#kpi-expense").textContent = money(total.expenses);
    $("#kpi-net").textContent = money(total.net);
    $("#kpi-net-margin").textContent = `結餘率 ${pct(total.income ? total.net / total.income : 0)}`;
    $("#kpi-payroll-ratio").textContent = pct(total.income ? (total.payroll + total.labor) / total.income : 0);
    $("#kpi-payroll-note").textContent = `正式 ${money(total.payroll)}・工讀 ${money(total.labor)}`;
    $("#kpi-food-ratio").textContent = pct(total.income ? food / total.income : 0);
    $("#kpi-daily-average").textContent = money(daily.length ? total.income / daily.length : 0);
    $("#kpi-days-note").textContent = `${daily.length} 個有營收日`;
    const selectedMonthValue = $("#month-filter").value;
    const previous = aggregate(comparisonStats("previous"));
    const priorYear = aggregate(comparisonStats("year"));
    const mom = selectedMonthValue ? changeText(total.income, previous.income) : { value: "—", note: "全年模式不計算月增率", className: "" };
    const yoy = changeText(total.income, priorYear.income);
    $("#kpi-mom-label").textContent = "較上月營收";
    $("#kpi-yoy-label").textContent = selectedMonthValue ? "較去年同月" : "較前年度";
    $("#kpi-mom-change").textContent = mom.value;
    $("#kpi-mom-change").className = mom.className;
    $("#kpi-mom-note").textContent = mom.note;
    $("#kpi-yoy-change").textContent = yoy.value;
    $("#kpi-yoy-change").className = yoy.className;
    $("#kpi-yoy-note").textContent = yoy.note;
    const platformIncome = stats.flatMap(item => item.incomeRows).filter(item => item.group === "平台收入" || /uber|foodpanda|熊貓|line|快一點|全支付|街口/i.test(`${item.category}${item.counterparty}`)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    $("#kpi-platform-share").textContent = pct(total.income ? platformIncome / total.income : 0);
    $("#kpi-labor-per-10k").textContent = money(total.income ? (total.payroll + total.labor) / total.income * 10000 : 0);
    $(".kpi.net").style.background = total.net < 0 ? "linear-gradient(145deg,#873c41,#b84f55)" : "linear-gradient(145deg,#173f67,#2f6f9f)";
  }

  function renderMonthlyChart(stats) {
    if (!stats.length) { $("#monthly-chart").innerHTML = '<p class="empty">目前沒有月份資料。</p>'; return; }
    const width = Math.max(720, stats.length * 92 + 90);
    const height = 330;
    const pad = { left: 64, right: 26, top: 24, bottom: 55 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const maxValue = Math.max(...stats.flatMap(item => [item.income, item.expenses, Math.max(0, item.net)]), 1) * 1.08;
    const xStep = plotWidth / stats.length;
    const y = value => pad.top + plotHeight - (Math.max(0, value) / maxValue * plotHeight);
    const grids = Array.from({ length: 5 }, (_, index) => {
      const value = maxValue * (4 - index) / 4;
      const lineY = pad.top + plotHeight * index / 4;
      return `<line class="chart-gridline" x1="${pad.left}" y1="${lineY}" x2="${width - pad.right}" y2="${lineY}"/><text class="chart-label" x="${pad.left - 8}" y="${lineY + 4}" text-anchor="end">${escapeHtml(compactFormat.format(value))}</text>`;
    }).join("");
    const bars = stats.map((item, index) => {
      const center = pad.left + xStep * index + xStep / 2;
      const barWidth = Math.min(25, xStep * .25);
      const incomeY = y(item.income);
      const expenseY = y(item.expenses);
      return `<rect class="chart-income is-drilldown" data-drilldown-month="${item.month}" data-drilldown-type="income" x="${center - barWidth - 2}" y="${incomeY}" width="${barWidth}" height="${pad.top + plotHeight - incomeY}" rx="4"><title>${item.month} 收入 ${money(item.income)}・點擊看明細</title></rect><rect class="chart-expense is-drilldown" data-drilldown-month="${item.month}" data-drilldown-type="expense" x="${center + 2}" y="${expenseY}" width="${barWidth}" height="${pad.top + plotHeight - expenseY}" rx="4"><title>${item.month} 支出 ${money(item.expenses)}・點擊看明細</title></rect><text class="chart-label" x="${center}" y="${height - 27}" text-anchor="middle">${Number(item.month.slice(5))}月</text>`;
    }).join("");
    const points = stats.map((item, index) => `${pad.left + xStep * index + xStep / 2},${y(Math.max(0, item.net))}`).join(" ");
    const dots = stats.map((item, index) => { const x = pad.left + xStep * index + xStep / 2; const pointY = y(Math.max(0, item.net)); return `<circle class="chart-dot is-drilldown" data-drilldown-month="${item.month}" data-drilldown-type="all" cx="${x}" cy="${pointY}" r="5"><title>${item.month} 結餘 ${money(item.net)}・點擊看明細</title></circle>`; }).join("");
    $("#monthly-chart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="每月收入、支出與結餘圖">${grids}${bars}<polyline class="chart-net" points="${points}"/>${dots}</svg>`;
  }

  function groupedValues(rows, key) {
    const map = new Map();
    rows.forEach(item => map.set(item[key] || "其他", (map.get(item[key] || "其他") || 0) + Number(item.amount || 0)));
    return [...map].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  }

  function canonicalRevenueCategory(value) {
    const key = String(value || "").toLowerCase().replace(/\s+/g, "");
    if (["現金收入", "當日現金營業額", "現金營業額"].includes(key)) return "現金收入";
    if (["快一點line", "快一點linepay", "快一點linepay收入", "快一點linepay支付"].includes(key)) return "快一點line pay收入";
    if (["linepay", "linepay收入", "linepay經營收入"].includes(key)) return "line Pay經營收入";
    if (["uber", "ubereat", "ubereats", "ubereat外送", "uber收入"].includes(key)) return "Uber eat外送";
    if (["熊貓", "foodpanda", "foodpanda外送", "熊貓外送"].includes(key)) return "foodpanda外送";
    if (["廢油", "其他", "其他收入"].includes(key)) return "其他收入";
    if (["街口", "街口支付", "街口經營收入"].includes(key)) return "街口經營收入";
    return String(value || "其他收入");
  }

  function groupedRevenueValues(rows) {
    return groupedValues(rows.map(item => ({ ...item, normalizedCategory: canonicalRevenueCategory(item.category) })), "normalizedCategory");
  }

  function renderBars(selector, rows, colorMode = "single", drilldown = {}) {
    const max = Math.max(...rows.map(item => item.amount), 1);
    $(selector).innerHTML = rows.length ? rows.map((item, index) => `<div class="bar-row ${drilldown.type ? "is-drilldown" : ""}" ${drilldown.type ? `data-drilldown-type="${drilldown.type}" data-drilldown-search="${escapeHtml(drilldown.useLabel ? item.label : drilldown.search || "")}"` : ""}><span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2, item.amount / max * 100)}%;${item.color || colorMode === "multi" ? `background:${item.color || COLORS[index % COLORS.length]}` : ""}"></div></div><span class="bar-value">${money(item.amount)}</span></div>`).join("") : '<p class="empty">目前沒有資料。</p>';
  }

  function renderCostStructure(stats) {
    const rows = stats.flatMap(item => item.expenseRows);
    const total = aggregate(stats);
    const requestedGroups = ["食材成本", "固定成本", "飲品成本", "雜貨成本"];
    const groups = requestedGroups.map(label => ({
      label,
      amount: rows.filter(row => row.group === label).reduce((sum, row) => sum + Number(row.amount || 0), 0),
      color: COST_COLORS[label]
    }));
    groups.push({ label: "人事成本", amount: total.payroll + total.labor, color: COST_COLORS["人事成本"] });
    const allocated = groups.reduce((sum, item) => sum + item.amount, 0);
    const other = Math.max(0, total.expenses - allocated);
    if (other) groups.push({ label: "其他支出", amount: other, color: COST_COLORS["其他支出"] });
    groups.sort((a, b) => b.amount - a.amount);
    renderBars("#cost-chart", groups.filter(item => item.amount > 0), "multi");
  }

  function rowsForCostGroup(stats, group) {
    return groupedValues(
      stats.flatMap(item => item.expenseRows).filter(item => item.group === group),
      "category"
    );
  }

  function renderCostAnalyses(stats) {
    const total = aggregate(stats);
    const definitions = [
      { key: "food", group: "食材成本", color: COST_COLORS["食材成本"] },
      { key: "fixed", group: "固定成本", color: COST_COLORS["固定成本"] },
      { key: "drink", group: "飲品成本", color: COST_COLORS["飲品成本"] },
      { key: "grocery", group: "雜貨成本", color: COST_COLORS["雜貨成本"] }
    ];
    definitions.forEach(definition => {
      const rows = rowsForCostGroup(stats, definition.group).slice(0, 8).map(row => ({ ...row, color: definition.color }));
      const amount = rowsForCostGroup(stats, definition.group).reduce((sum, row) => sum + row.amount, 0);
      $(`#${definition.key}-cost-total`).textContent = money(amount);
      $(`#${definition.key}-cost-share`).textContent = `占總支出 ${pct(total.expenses ? amount / total.expenses : 0)}・占收入 ${pct(total.income ? amount / total.income : 0)}`;
      renderBars(`#${definition.key}-cost-chart`, rows, "single", { type: "expense", useLabel: true });
    });

    const labor = total.payroll + total.labor;
    $("#labor-cost-total").textContent = money(labor);
    $("#labor-cost-share").textContent = `占總支出 ${pct(total.expenses ? labor / total.expenses : 0)}・占收入 ${pct(total.income ? labor / total.income : 0)}`;
    renderBars("#labor-cost-chart", [
      { label: "正式員工薪資", amount: total.payroll, color: COST_COLORS["人事成本"] },
      { label: "臨時工讀日薪", amount: total.labor, color: "#c67c27" }
    ].filter(item => item.amount > 0), "single");
  }

  function renderRevenueMix(stats) {
    const rows = groupedRevenueValues(stats.flatMap(item => item.incomeRows)).slice(0, 8);
    if (!rows.length) {
      $("#revenue-donut").style.background = "#ece8df";
      $("#revenue-legend").innerHTML = '<p class="empty">目前沒有收入資料。</p>';
      return;
    }
    const total = rows.reduce((sum, item) => sum + item.amount, 0) || 1;
    let cursor = 0;
    const segments = rows.map((item, index) => {
      const start = cursor;
      cursor += item.amount / total * 360;
      return `${COLORS[index % COLORS.length]} ${start}deg ${cursor}deg`;
    });
    $("#revenue-donut").style.background = `conic-gradient(${segments.join(",")})`;
    $("#revenue-legend").innerHTML = rows.map((item, index) => `<div class="legend-row is-drilldown" data-drilldown-type="income" data-drilldown-search="${escapeHtml(item.label)}"><i class="legend-dot" style="background:${COLORS[index % COLORS.length]}"></i><strong>${escapeHtml(item.label)}</strong><span>${pct(item.amount / total)}・${money(item.amount)}</span></div>`).join("");
  }

  function renderWeekdays(stats) {
    const labels = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const groups = Array.from({ length: 7 }, (_, day) => ({ label: labels[day], amount: 0, count: 0 }));
    dailyIncomeRows(stats).forEach(item => {
      const day = new Date(`${item.date}T12:00:00`).getDay();
      groups[day].amount += item.amount;
      groups[day].count += 1;
    });
    renderBars("#weekday-chart", groups.map(item => ({ label: item.label, amount: item.count ? item.amount / item.count : 0 })), "single", { type: "income" });
  }

  function renderPayroll(stats) {
    const max = Math.max(...stats.flatMap(item => [item.payroll.amount, item.labor]), 1);
    $("#payroll-chart").innerHTML = stats.length ? stats.map(item => `<div class="payroll-month is-drilldown" data-drilldown-month="${item.month}" data-drilldown-system="salary"><strong>${Number(item.month.slice(5))}月</strong><div class="payroll-bars"><div class="payroll-bar official" style="width:${Math.max(item.payroll.amount ? 2 : 0, item.payroll.amount / max * 100)}%" title="正式薪資 ${money(item.payroll.amount)}"></div><div class="payroll-bar labor" style="width:${Math.max(item.labor ? 2 : 0, item.labor / max * 100)}%" title="臨時工讀 ${money(item.labor)}"></div></div><span class="payroll-value">${money(item.payroll.amount + item.labor)}</span></div>`).join("") + '<div class="payroll-legend"><span><i class="swatch" style="background:#2f6f9f"></i>正式薪資</span><span><i class="swatch" style="background:#c67c27"></i>臨時工讀</span></div>' : '<p class="empty">目前沒有人事成本資料。</p>';
  }

  function renderInsights(stats) {
    const total = aggregate(stats);
    const groups = groupedValues(stats.flatMap(item => item.expenseRows), "group");
    const revenueGroups = groupedRevenueValues(stats.flatMap(item => item.incomeRows));
    const payrollRatio = total.income ? (total.payroll + total.labor) / total.income : 0;
    const costRatio = total.income ? total.expenses / total.income : 0;
    const platform = revenueGroups.filter(item => ["Uber eat外送", "foodpanda外送"].includes(item.label)).reduce((sum, item) => sum + item.amount, 0);
    const insights = [];
    insights.push({ tone: costRatio > .85 ? "bad" : costRatio > .75 ? "warn" : "good", title: `整體成本率 ${pct(costRatio)}`, text: costRatio > .85 ? "支出已接近收入，應優先檢查食材、人事及單次大額費用。" : costRatio > .75 ? "成本仍在可控範圍，但結餘空間偏薄，適合逐月追蹤。" : "目前支出結構相對健康，仍需持續觀察淡旺季差異。" });
    if (groups[0]) insights.push({ tone: "", title: `最大一般支出：${groups[0].label}`, text: `累計 ${money(groups[0].amount)}，占一般營運支出 ${pct(total.operating ? groups[0].amount / total.operating : 0)}。` });
    insights.push({ tone: payrollRatio > .32 ? "warn" : "", title: `人事成本率 ${pct(payrollRatio)}`, text: `正式薪資 ${money(total.payroll)}，臨時工讀 ${money(total.labor)}。日薪工讀獨立列示，不會混入正式員工薪資。` });
    insights.push({ tone: "", title: `外送平台收入 ${money(platform)}`, text: `Uber＋Foodpanda 占收入 ${pct(total.income ? platform / total.income : 0)}，平台數字採逐筆淨收入重新彙總。` });
    if (stats.length > 1) {
      const current = stats.at(-1);
      const previous = stats.at(-2);
      const change = current.income - previous.income;
      insights.push({ tone: change < 0 ? "warn" : "good", title: `${current.month} 營收較前月${change >= 0 ? "增加" : "減少"}`, text: `${money(Math.abs(change))}；結餘為 ${money(current.net)}。` });
    }
    $("#insights").innerHTML = insights.map(item => `<div class="insight ${item.tone}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span></div>`).join("");
  }

  function renderTable(stats) {
    $("#monthly-table").innerHTML = stats.map(item => `<tr class="is-drilldown" data-drilldown-month="${item.month}" data-drilldown-type="all"><td data-label="月份"><strong>${escapeHtml(item.month)}</strong></td><td data-label="收入">${money(item.income)}</td><td data-label="一般支出">${money(item.operating)}</td><td data-label="正式薪資">${money(item.payroll.amount)}</td><td data-label="臨時工讀">${money(item.labor)}</td><td data-label="總支出">${money(item.expenses)}</td><td data-label="結餘" class="${item.net >= 0 ? "positive" : "negative"}">${money(item.net)}</td><td data-label="結餘率" class="${item.net >= 0 ? "positive" : "negative"}">${pct(item.income ? item.net / item.income : 0)}</td></tr>`).join("");
  }

  function renderOperationsAlerts(stats) {
    const bridge = window.BreakfastOperationsStore?.moduleData("accounting") || safeJson(ACCOUNTING_BRIDGE_KEY);
    const selected = new Set(stats.map(item => item.month));
    const alerts = [];
    targetMetrics(stats).filter(item => item.actual > item.budget && item.income > 0).forEach(item => {
      alerts.push({ month: drilldownMonth() || $("#year-filter").value, tone: "danger", message: `${item.label}率 ${pct(item.rate)} 已超過目標 ${pct(item.targetRate)}，超出 ${money(item.actual - item.budget)}。`, code: "target-over" });
    });
    Object.entries(bridge?.months || {}).filter(([month]) => selected.has(month)).forEach(([month, item]) => {
      (item.exceptions || []).forEach(exception => alerts.push({
        month,
        ...exception,
        message: [exception.title, exception.detail].filter(Boolean).join("："),
        code: String(exception.title || "").includes("薪資尚未月結") ? "missing-payroll" : "accounting-exception"
      }));
    });
    stats.forEach(item => {
      if (!item.payroll.ready && !alerts.some(alert => alert.month === item.month && alert.code === "missing-payroll")) alerts.push({ month: item.month, tone: "danger", message: "尚未完成正式薪資月結。", code: "missing-payroll" });
      if (item.income > 0 && item.expenses / item.income > .9) alerts.push({ month: item.month, tone: "warning", message: `總成本率已達 ${pct(item.expenses / item.income)}。`, code: "high-cost" });
      if (item.net < 0) alerts.push({ month: item.month, tone: "danger", message: `本月收支為負 ${money(Math.abs(item.net))}。`, code: "negative-net" });
    });
    $("#operations-alert-count").textContent = alerts.length ? `${alerts.length} 項待處理` : "目前皆正常";
    $("#operations-alerts").innerHTML = alerts.length ? alerts.slice(0, 30).map(alert => `<button class="operations-alert ${alert.tone || "warning"}" type="button" data-drilldown-month="${escapeHtml(alert.month)}" data-drilldown-type="${alert.code === "missing-payroll" ? "" : "all"}" ${alert.code === "missing-payroll" ? 'data-drilldown-system="salary"' : ""}><strong>${escapeHtml(alert.month)}</strong><span>${escapeHtml(alert.message || "需要確認")}</span><b>前往處理 →</b></button>`).join("") : '<div class="operations-all-clear"><strong>✓ 三個系統資料目前沒有阻擋月結的異常</strong><span>仍建議月底完成現金／非現金對帳及薪資月結確認。</span></div>';
  }

  function render() {
    accounting = loadAccounting();
    const stats = selectedStats();
    renderFreshness(stats);
    renderOperationsAlerts(stats);
    renderKpis(stats);
    renderTargets(stats);
    renderMonthlyChart(stats);
    renderCostStructure(stats);
    renderCostAnalyses(stats);
    renderRevenueMix(stats);
    renderWeekdays(stats);
    renderPayroll(stats);
    renderVendorTrend(stats);
    renderInsights(stats);
    renderTable(stats);
  }

  function setAnalyticsMenu(open) {
    document.body.classList.toggle("analytics-menu-open", Boolean(open));
    $(".analytics-mobile-menu")?.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function init() {
    renderFilters();
    $("#year-filter").addEventListener("change", () => {
      $("#month-filter").value = "";
      updateMonthOptions();
      persistFilterInUrl();
      render();
    });
    $("#month-filter").addEventListener("change", () => {
      persistFilterInUrl();
      render();
    });
    $("#save-analysis-targets").addEventListener("click", () => {
      analysisSettings = {
        foodRate: Math.min(100, Math.max(1, Number($("#target-food-rate").value || 35))),
        laborRate: Math.min(100, Math.max(1, Number($("#target-labor-rate").value || 30))),
        fixedRate: Math.min(100, Math.max(1, Number($("#target-fixed-rate").value || 15)))
      };
      localStorage.setItem(ANALYSIS_SETTINGS_KEY, JSON.stringify(analysisSettings));
      render();
      showToast("成本目標已儲存，異常中心已重新檢查。", "success");
    });
    $(".analytics-mobile-menu").addEventListener("click", () => setAnalyticsMenu(!document.body.classList.contains("analytics-menu-open")));
    $(".analytics-sidebar-backdrop").addEventListener("click", () => setAnalyticsMenu(false));
    $(".analytics-section-nav").addEventListener("click", event => {
      const link = event.target.closest("a");
      if (!link) return;
      document.querySelectorAll(".analytics-section-nav a").forEach(item => item.classList.toggle("is-active", item === link));
      setAnalyticsMenu(false);
    });
    document.addEventListener("keydown", event => { if (event.key === "Escape") setAnalyticsMenu(false); });
    $("#refresh-data").addEventListener("click", render);
    document.querySelectorAll(".export-chart").forEach(button => button.addEventListener("click", exportChart));
    document.addEventListener("click", event => {
      const target = event.target.closest("[data-drilldown-type],[data-drilldown-system]");
      if (target && !event.target.closest(".export-chart")) openDrilldown(target);
    });
    window.addEventListener("storage", event => { if ([ACCOUNTING_KEY, PAYROLL_KEY, PAYROLL_BRIDGE_KEY, ACCOUNTING_BRIDGE_KEY, window.BreakfastOperationsStore?.key].includes(event.key)) render(); });
    window.BreakfastOperationsStore?.subscribe(event => {
      if (event.moduleName === "global-month" && event.source !== "analytics" && /^\d{4}-(0[1-9]|1[0-2])$/.test(event.month || "")) {
        $("#year-filter").value = event.month.slice(0, 4);
        updateMonthOptions();
        $("#month-filter").value = event.month.slice(5);
        persistFilterInUrl();
      }
      render();
    });
    render();
    refreshAnalysisFromCloud();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
