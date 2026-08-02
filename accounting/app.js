(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-accounting-v1";
  const PAYROLL_STORAGE_KEY = "breakfast-payroll-v1";
  const PAYROLL_BRIDGE_KEY = "breakfast-payroll-summary-v1";
  const ACCOUNTING_BRIDGE_KEY = "breakfast-accounting-summary-v1";
  const ACCOUNTING_PAGE_KEY = "breakfast-accounting-active-page-v1";
  const ACCOUNTING_CLOUD_META_KEY = "breakfast-accounting-cloud-meta-v1";
  const ACCOUNTING_CLOUD_DELAY = 60_000;
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
  const SALARY_HISTORY = {
    payroll: Object.assign({}, ...SALARY_HISTORIES.map(item => item.payroll || {}))
  };
  const $ = selector => document.querySelector(selector);
  const moneyFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

  const GROUPS = {
    income: ["現金收入", "平台收入", "其他收入"],
    expense: ["食材成本", "飲品成本", "雜貨成本", "人事成本", "固定成本", "其他支出"]
  };
  const DEFAULT_CATEGORY_CATALOG = {
    income: {
      "現金收入": ["現金營業收入"],
      "平台收入": ["line Pay經營收入", "快一點line pay收入", "全支付收入", "街口支付收入", "Uber eat外送", "foodpanda外送"],
      "其他收入": ["其他收入", "廢油收入"]
    },
    expense: {
      "食材成本": [],
      "飲品成本": [],
      "雜貨成本": [],
      "人事成本": ["正式員工薪資", "臨時工讀日薪", "一般勞務費"],
      "固定成本": ["房租", "電費", "水費", "瓦斯費", "電話費", "勞保費", "健保費", "雇主提撥勞退", "稅金", "保險", "平台手續費"],
      "其他支出": ["其他雜支", "行銷費用", "設備費用"]
    }
  };

  function emptyCategoryCatalog() {
    return Object.fromEntries(Object.entries(GROUPS).map(([type, groups]) => [
      type,
      Object.fromEntries(groups.map(group => [group, []]))
    ]));
  }

  function addCatalogItem(catalog, type, group, item) {
    const name = String(item || "").trim();
    if (!name || !GROUPS[type]?.includes(group)) return false;
    const list = catalog[type][group];
    if (list.some(value => value.toLocaleLowerCase("zh-TW") === name.toLocaleLowerCase("zh-TW"))) return false;
    list.push(name);
    list.sort((a, b) => a.localeCompare(b, "zh-Hant"));
    return true;
  }

  function canonicalIncomeItem(value) {
    const text = String(value || "").trim();
    const key = text.toLowerCase().replace(/[\s_\-]/g, "");
    if (/uber/.test(key)) return "Uber eat外送";
    if (/foodpanda|熊貓/.test(key)) return "foodpanda外送";
    if (/快一點/.test(key)) return "快一點line pay收入";
    if (/linepay|line收入/.test(key)) return "line Pay經營收入";
    if (/全支付/.test(key)) return "全支付收入";
    if (/街口/.test(key)) return "街口支付收入";
    if (/現金/.test(key)) return "現金營業收入";
    if (/廢油/.test(key)) return "廢油收入";
    return text;
  }

  function catalogGroupForRow(row) {
    const key = `${row.group || ""}${row.category || ""}${row.counterparty || ""}`.toLowerCase().replace(/[\s_\-]/g, "");
    if (row.type === "income") {
      if (/uber|foodpanda|熊貓|linepay|line收入|快一點|全支付|街口/.test(key)) return "平台收入";
      if (/其他|廢油/.test(key)) return "其他收入";
      if (GROUPS.income.includes(row.group)) return row.group;
      return "現金收入";
    }
    if (/薪資|工讀|勞務/.test(key)) return "人事成本";
    if (GROUPS.expense.includes(row.group)) return row.group;
    return "其他支出";
  }

  function catalogCandidates(row, group) {
    if (row.type === "income") {
      const item = canonicalIncomeItem(row.category || row.counterparty || group);
      return item && item !== group ? [item] : [];
    }
    return [row.category, row.counterparty]
      .flatMap(value => String(value || "").split(/[／/、+＋&＆]/))
      .map(value => value.trim())
      .filter(value => value && value !== group && value !== "未分類");
  }

  function buildDefaultCategoryCatalog(transactions = []) {
    const catalog = emptyCategoryCatalog();
    for (const [type, groups] of Object.entries(DEFAULT_CATEGORY_CATALOG)) {
      for (const [group, items] of Object.entries(groups)) {
        for (const item of items) addCatalogItem(catalog, type, group, item);
      }
    }
    for (const row of transactions) {
      if (!GROUPS[row.type]) continue;
      const group = catalogGroupForRow(row);
      for (const item of catalogCandidates(row, group)) addCatalogItem(catalog, row.type, group, item);
    }
    return catalog;
  }

  function mergeCategoryCatalog(base, saved) {
    const catalog = base || emptyCategoryCatalog();
    for (const type of Object.keys(GROUPS)) {
      for (const group of GROUPS[type]) {
        for (const item of Array.isArray(saved?.[type]?.[group]) ? saved[type][group] : []) addCatalogItem(catalog, type, group, item);
      }
    }
    return catalog;
  }

  function syncCategoryCatalog(rows) {
    state.categoryCatalog = mergeCategoryCatalog(
      state.categoryCatalog || buildDefaultCategoryCatalog([]),
      buildDefaultCategoryCatalog(rows)
    );
  }

  let toastTimer;
  let state = loadState();
  let selectedLedgerDate = "";
  let pendingBackupImport = null;
  let pendingUberImport = null;
  let pendingFoodpandaImport = null;
  let cloudUser = null;
  let cloudReady = false;
  let cloudApplying = false;
  let cloudSaveTimer = 0;
  let cloudRemote = null;

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function initialState() {
    return {
      version: 4,
      selectedMonth: currentMonth(),
      transactions: (HISTORY.transactions || []).map(item => ({ ...item })),
      categoryCatalog: buildDefaultCategoryCatalog(HISTORY.transactions || []),
      catalogItemSettings: {},
      dayLabor: [],
      recurringTemplates: [],
      importBatches: [],
      reconciliations: {},
      dailyClosures: {},
      closedMonths: {},
      auditLog: [],
      undoLog: [],
      importedSources: HISTORY.id ? { [HISTORY.id]: { source: HISTORY.source, importedAt: "2026-08-01" } } : {}
    };
  }

  function normalizeState(value) {
    const base = initialState();
    const normalized = {
      ...base,
      ...(value || {}),
      version: 4,
      transactions: Array.isArray(value?.transactions) ? value.transactions : base.transactions,
      dayLabor: Array.isArray(value?.dayLabor) ? value.dayLabor : [],
      recurringTemplates: Array.isArray(value?.recurringTemplates) ? value.recurringTemplates : [],
      importBatches: Array.isArray(value?.importBatches) ? value.importBatches : [],
      reconciliations: value?.reconciliations && typeof value.reconciliations === "object" ? value.reconciliations : {},
      dailyClosures: value?.dailyClosures && typeof value.dailyClosures === "object" ? value.dailyClosures : {},
      closedMonths: value?.closedMonths && typeof value.closedMonths === "object" ? value.closedMonths : {},
      auditLog: Array.isArray(value?.auditLog) ? value.auditLog.slice(0, 300) : [],
      undoLog: Array.isArray(value?.undoLog) ? value.undoLog.slice(0, 20) : [],
      catalogItemSettings: value?.catalogItemSettings && typeof value.catalogItemSettings === "object" ? value.catalogItemSettings : {},
      importedSources: { ...base.importedSources, ...(value?.importedSources || {}) }
    };
    if (HISTORY.id && !value?.importedSources?.[HISTORY.id]) {
      const existing = new Set(normalized.transactions.map(item => item.id));
      for (const item of HISTORY.transactions || []) {
        if (!existing.has(item.id)) normalized.transactions.push({ ...item });
      }
      normalized.importedSources[HISTORY.id] = { source: HISTORY.source, importedAt: "2026-08-01" };
    }
    normalized.categoryCatalog = mergeCategoryCatalog(
      buildDefaultCategoryCatalog(normalized.transactions),
      value?.categoryCatalog
    );
    return normalized;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const normalized = normalizeState(raw ? JSON.parse(raw) : null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.warn("Unable to load accounting state", error);
      return initialState();
    }
  }

  function saveState(message = "已儲存於本機") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!cloudApplying) {
      const meta = readCloudMeta();
      writeCloudMeta({ ...meta, dirty: true });
      scheduleCloudSave();
    }
    window.BreakfastOperationsStore?.setGlobalMonth(state.selectedMonth, "accounting");
    window.BreakfastOperationsStore?.autoSnapshot("accounting", state, {
      label: "記帳每日自動快照",
      summary: {
        month: state.selectedMonth,
        transactions: state.transactions.length,
        labor: state.dayLabor.length
      }
    });
    publishAccountingBridge();
    const indicator = $("#save-status");
    indicator.textContent = message;
    window.setTimeout(() => { indicator.textContent = "已儲存於本機"; }, 1300);
  }

  function readCloudMeta() {
    try {
      const value = JSON.parse(localStorage.getItem(ACCOUNTING_CLOUD_META_KEY) || "null");
      return value && typeof value === "object" ? { revision: "", dirty: false, ...value } : { revision: "", dirty: false };
    } catch {
      return { revision: "", dirty: false };
    }
  }

  function writeCloudMeta(value) {
    localStorage.setItem(ACCOUNTING_CLOUD_META_KEY, JSON.stringify(value));
  }

  function setCloudStatus(message, tone = "") {
    const status = $("#accounting-cloud-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function showCloudConflict(show) {
    $("#accounting-cloud-conflict-actions")?.toggleAttribute("hidden", !show);
  }

  async function cloudRequestBody(payload) {
    const jsonText = JSON.stringify(payload);
    if (typeof CompressionStream !== "function") {
      return { body: jsonText, headers: { "Content-Type": "application/json" } };
    }
    const stream = new Blob([jsonText]).stream().pipeThrough(new CompressionStream("gzip"));
    const body = await new Response(stream).blob();
    return { body, headers: { "Content-Type": "application/json", "Content-Encoding": "gzip" } };
  }

  function scheduleCloudSave() {
    if (!cloudReady || !cloudUser) return;
    window.clearTimeout(cloudSaveTimer);
    setCloudStatus("本機已儲存，60 秒後同步雲端", "waiting");
    cloudSaveTimer = window.setTimeout(() => syncAccountingCloud(), ACCOUNTING_CLOUD_DELAY);
  }

  async function syncAccountingCloud(options = {}) {
    if (!cloudUser || !cloudReady) return false;
    window.clearTimeout(cloudSaveTimer);
    const meta = readCloudMeta();
    setCloudStatus("正在壓縮並同步雲端…", "working");
    try {
      const request = await cloudRequestBody({
        state,
        baseRevision: options.force ? "" : meta.revision,
        force: options.force === true
      });
      const response = await fetch("/api/operations-state", {
        method: "PUT",
        credentials: "same-origin",
        headers: request.headers,
        body: request.body
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        cloudRemote = { revision: result.revision || "" };
        showCloudConflict(true);
        setCloudStatus("偵測到另一個雲端版本，請選擇保留哪一份", "danger");
        return false;
      }
      if (!response.ok) throw new Error(result.message || `同步失敗（${response.status}）`);
      writeCloudMeta({ revision: result.revision || "", dirty: false, updatedAt: result.updatedAt || new Date().toISOString() });
      cloudRemote = null;
      showCloudConflict(false);
      setCloudStatus(`雲端已同步・${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`, "success");
      return true;
    } catch (error) {
      setCloudStatus(error instanceof Error ? error.message : "雲端同步暫時失敗，本機資料仍安全", "danger");
      return false;
    }
  }

  async function adoptCloudState(remote) {
    if (!remote?.state) return;
    try {
      await window.BreakfastOperationsStore?.createSnapshot("accounting", state, {
        label: "載入雲端資料前快照",
        reason: `雲端版本 ${remote.revision || "未知"}`
      });
    } catch (error) {
      console.warn("Unable to create pre-cloud snapshot", error);
    }
    const selectedMonth = state.selectedMonth;
    cloudApplying = true;
    state = normalizeState(remote.state);
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth || "")) state.selectedMonth = selectedMonth;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    cloudApplying = false;
    writeCloudMeta({ revision: remote.revision || "", dirty: false, updatedAt: remote.updatedAt || "" });
    window.BreakfastOperationsStore?.setGlobalMonth(state.selectedMonth, "accounting");
    publishAccountingBridge();
    renderMonthOptions();
    setFormDates();
    renderAll();
    renderSnapshotList();
    cloudRemote = null;
    showCloudConflict(false);
    setCloudStatus(`已載入雲端資料・${remote.updatedBy || "系統"}`, "success");
  }

  async function fetchCloudState() {
    const response = await fetch("/api/operations-state", { credentials: "same-origin", cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `讀取雲端失敗（${response.status}）`);
    return result;
  }

  async function initializeAccountingCloud() {
    setCloudStatus("正在檢查 Vercel 雲端登入…", "working");
    try {
      const sessionResponse = await fetch("/api/auth/session", { credentials: "same-origin", cache: "no-store" });
      const session = await sessionResponse.json().catch(() => ({}));
      cloudUser = session.user || null;
      $("#accounting-cloud-login").textContent = cloudUser ? "重新登入" : "登入 Vercel";
      $("#accounting-cloud-signout")?.toggleAttribute("hidden", !cloudUser);
      if (!cloudUser) {
        setCloudStatus("尚未登入；目前只儲存在本機", "waiting");
        return;
      }
      const remote = await fetchCloudState();
      cloudReady = true;
      cloudRemote = remote;
      const meta = readCloudMeta();
      if (!remote.state) {
        writeCloudMeta({ ...meta, revision: "" });
        await syncAccountingCloud();
        return;
      }
      if (meta.dirty && meta.revision && meta.revision !== remote.revision) {
        showCloudConflict(true);
        setCloudStatus("本機與雲端都有新資料，請選擇保留哪一份", "danger");
        return;
      }
      if (meta.dirty && meta.revision === remote.revision) {
        await syncAccountingCloud();
        return;
      }
      await adoptCloudState(remote);
    } catch (error) {
      cloudReady = false;
      setCloudStatus(error instanceof Error ? error.message : "無法連接雲端，本機資料仍可使用", "danger");
    }
  }

  function catalogItemKey(type, group, item) {
    return `${type}::${group}::${String(item || "").trim()}`;
  }

  function catalogSetting(type, group, item) {
    const key = catalogItemKey(type, group, item);
    return { active: true, aliases: [], defaultPaymentMethod: "", updatedAt: "", ...(state.catalogItemSettings[key] || {}) };
  }

  function setCatalogSetting(type, group, item, value) {
    state.catalogItemSettings[catalogItemKey(type, group, item)] = {
      active: value.active !== false,
      aliases: [...new Set((value.aliases || []).map(alias => String(alias).trim()).filter(Boolean))],
      defaultPaymentMethod: String(value.defaultPaymentMethod || ""),
      updatedAt: new Date().toISOString()
    };
  }

  function activeCatalogItems(type, group) {
    return (state.categoryCatalog?.[type]?.[group] || []).filter(item => catalogSetting(type, group, item).active !== false);
  }

  function logAudit(action, detail = "", month = state.selectedMonth) {
    state.auditLog.unshift({
      id: uid("audit"),
      month,
      action,
      detail,
      actor: "本機使用者",
      timestamp: new Date().toISOString()
    });
    state.auditLog = state.auditLog.slice(0, 300);
  }

  function pushUndo(action, entityType, operation, payload) {
    state.undoLog.unshift({ id: uid("undo"), action, entityType, operation, payload, timestamp: new Date().toISOString() });
    state.undoLog = state.undoLog.slice(0, 20);
  }

  function isMonthLocked(month = state.selectedMonth) {
    return Boolean(state.closedMonths?.[month]?.locked);
  }

  function isDateLocked(date) {
    return isMonthLocked(String(date || "").slice(0, 7)) || Boolean(state.dailyClosures?.[date]?.locked);
  }

  function requireUnlockedDate(date, action = "修改") {
    if (!isDateLocked(date)) return true;
    toast(`${date} 已完成關帳，請先解除鎖定再${action}。`);
    return false;
  }

  function normalizeAlias(value) {
    return String(value || "").trim().toLocaleLowerCase("zh-TW").replace(/[\s_\-]/g, "");
  }

  function mappedCatalogValue(type, group, value) {
    const normalized = normalizeAlias(value);
    if (!normalized) return { group, item: value };
    for (const candidateGroup of GROUPS[type] || []) {
      for (const item of state.categoryCatalog?.[type]?.[candidateGroup] || []) {
        const setting = catalogSetting(type, candidateGroup, item);
        if (normalizeAlias(item) === normalized || setting.aliases.some(alias => normalizeAlias(alias) === normalized)) {
          return { group: candidateGroup, item };
        }
      }
    }
    return { group, item: value };
  }

  function applyCatalogMappings(rows) {
    return rows.map(row => {
      const mapped = mappedCatalogValue(row.type, row.group, row.category || row.counterparty);
      return { ...row, group: mapped.group || row.group, category: mapped.item || row.category };
    });
  }

  async function createSafetySnapshot(label, reason = "") {
    const snapshot = await window.BreakfastOperationsStore?.createSnapshot("accounting", state, {
      label,
      reason,
      summary: { month: state.selectedMonth, transactions: state.transactions.length, labor: state.dayLabor.length }
    });
    if (snapshot) {
      logAudit("建立安全快照", label);
      saveState("安全快照已建立");
    }
    return snapshot;
  }

  function currentMonth() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(month) {
    const [year, value] = month.split("-");
    return `${year} 年 ${Number(value)} 月`;
  }

  function money(value) {
    return moneyFormatter.format(Number(value) || 0);
  }

  function decimal(value, digits = 1) {
    return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(value) || 0);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  }

  const ACCOUNTING_PAGES = {
    entry: {
      eyebrow: "NEW ENTRY",
      title: "新增今天的收入與支出。",
      description: "一般收支、臨時工讀日薪與每月固定項目集中在這裡登錄，儲存後會立即反映到月份明細與分析系統。"
    },
    ledger: {
      eyebrow: "MONTHLY LEDGER",
      title: "月份收支，一天一天核對。",
      description: "用月曆查看每日收入與支出，點選日期即可核對明細、實際現金與電子支付入帳。"
    },
    import: {
      eyebrow: "IMPORT CENTER",
      title: "把來源資料安全帶進系統。",
      description: "記帳備份與 Uber 對帳單都會先在本機完成解析及重複核對，確認後才寫入，並可下載安全備份。"
    },
    catalog: {
      eyebrow: "CATEGORY & ITEM SETTINGS",
      title: "分類固定，項目隨店務一起成長。",
      description: "收入與支出分類採一致口徑；歷史收入項目及支出廠商已預先整理，也可以隨時新增新的項目。"
    },
    safety: {
      eyebrow: "CLOSE & RECOVERY CENTER",
      title: "每天核對，月底安心鎖定。",
      description: "每日關帳、月底結帳、修改歷程與安全快照集中管理；即使誤刪或誤還原，也能回到先前版本。"
    }
  };

  function setAccountingMenu(open) {
    document.body.classList.toggle("accounting-menu-open", Boolean(open));
    const trigger = document.querySelector(".accounting-mobile-menu");
    if (trigger) trigger.setAttribute("aria-expanded", String(Boolean(open)));
  }

  function setAccountingPage(page, { updateUrl = true, focus = false } = {}) {
    const selected = ACCOUNTING_PAGES[page] ? page : "entry";
    document.querySelectorAll("[data-accounting-page]").forEach(panel => {
      panel.hidden = panel.dataset.accountingPage !== selected;
    });
    document.querySelectorAll("[data-accounting-tab]").forEach(tab => {
      const active = tab.dataset.accountingTab === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    const copy = ACCOUNTING_PAGES[selected];
    $("#accounting-page-eyebrow").textContent = copy.eyebrow;
    $("#accounting-page-title").textContent = copy.title;
    $("#accounting-page-description").textContent = copy.description;
    localStorage.setItem(ACCOUNTING_PAGE_KEY, selected);
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", selected);
      window.history.replaceState({}, "", url);
    }
    setAccountingMenu(false);
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => element.classList.remove("is-visible"), 2600);
  }

  function safeJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function sumRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.total || 0), 0);
  }

  function payrollForMonth(month) {
    const bridge = safeJson(PAYROLL_BRIDGE_KEY);
    const bridged = bridge?.months?.[month];
    if (bridged && Number.isFinite(Number(bridged.total))) {
      return { amount: Number(bridged.total), source: bridged.source || "薪資管理 APP", ready: true };
    }

    const payrollState = safeJson(PAYROLL_STORAGE_KEY);
    const snapshot = payrollState?.closedMonths?.[month]?.snapshot;
    if (Array.isArray(snapshot?.rows)) {
      return { amount: sumRows(snapshot.rows), source: "薪資管理・鎖定月結", ready: true };
    }

    const bundledRows = SALARY_HISTORY.payroll?.[month];
    if (Array.isArray(bundledRows)) {
      return { amount: sumRows(bundledRows), source: `${month.slice(0, 4)} 工資簿匯入快照`, ready: true };
    }
    return { amount: 0, source: "尚無薪資月結資料", ready: false };
  }

  function monthTransactions(month) {
    return state.transactions.filter(item => item.date?.startsWith(month));
  }

  function monthLabor(month) {
    return state.dayLabor.filter(item => item.date?.startsWith(month));
  }

  function monthStats(month) {
    const transactions = monthTransactions(month);
    const income = transactions.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const operating = transactions.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const payroll = payrollForMonth(month);
    const labor = monthLabor(month).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expenses = operating + payroll.amount + labor;
    return { income, operating, payroll, labor, expenses, net: income - expenses };
  }

  function accountingExceptions(month) {
    const transactions = monthTransactions(month);
    const stats = monthStats(month);
    const reconciliations = Object.entries(state.reconciliations)
      .filter(([date]) => date.startsWith(month))
      .map(([, value]) => value);
    const unresolvedReconciliations = reconciliations.filter(item => Math.abs(Number(item.difference || 0)) > 1);
    const importedSources = new Set(["workbook", "accounting-backup", "uber-statement"]);
    const unreceiptedLargeExpenses = transactions.filter(item => item.type === "expense" && Number(item.amount || 0) >= 5000 && !item.receiptDataUrl && !importedSources.has(item.source));
    const missingCounterparty = transactions.filter(item => item.type === "expense" && !item.counterparty && !importedSources.has(item.source));
    const exceptions = [];
    if (!stats.payroll.ready) exceptions.push({ tone: "danger", title: "正式員工薪資尚未月結", detail: "記帳與分析目前無法取得本月正式薪資。" });
    if (unresolvedReconciliations.length) exceptions.push({ tone: "danger", title: `${unresolvedReconciliations.length} 天對帳有差額`, detail: unresolvedReconciliations.slice(0, 4).map(item => `${item.date.slice(5)} ${money(item.difference)}`).join("、") });
    if (unreceiptedLargeExpenses.length) exceptions.push({ tone: "warning", title: `${unreceiptedLargeExpenses.length} 筆大額支出沒有收據照片`, detail: "限本機新增且單筆達 $5,000 的支出。" });
    if (missingCounterparty.length) exceptions.push({ tone: "warning", title: `${missingCounterparty.length} 筆支出未填往來對象`, detail: "補上供應商後，成本分析與搜尋會更準確。" });
    return exceptions;
  }

  function publishAccountingBridge() {
    try {
      const months = {};
      const knownMonths = availableLedgerMonths();
      for (const month of knownMonths) {
        const stats = monthStats(month);
        const transactions = monthTransactions(month);
        const foodCost = transactions
          .filter(item => item.type === "expense" && /食材|飲品|雜貨/.test(`${item.group} ${item.category}`))
          .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const reconciliations = Object.values(state.reconciliations).filter(item => item.date?.startsWith(month));
        months[month] = {
          income: stats.income,
          operating: stats.operating,
          payroll: stats.payroll.amount,
          payrollReady: stats.payroll.ready,
          labor: stats.labor,
          expenses: stats.expenses,
          net: stats.net,
          foodCost,
          transactionCount: transactions.length,
          reconciledDays: reconciliations.length,
          reconciliationDifference: reconciliations.reduce((sum, item) => sum + Math.abs(Number(item.difference || 0)), 0),
          exceptions: accountingExceptions(month)
        };
      }
      const payload = { version: 2, generatedAt: new Date().toISOString(), months };
      localStorage.setItem(ACCOUNTING_BRIDGE_KEY, JSON.stringify(payload));
      window.BreakfastOperationsStore?.publish("accounting", payload);
    } catch (error) {
      console.warn("Unable to publish accounting summary", error);
    }
  }

  function materializeRecurring(month) {
    if (isMonthLocked(month)) return 0;
    let created = 0;
    state.recurringTemplates.filter(template => template.active !== false).forEach(template => {
      if (template.effectiveFrom && month < template.effectiveFrom) return;
      if (template.effectiveTo && month > template.effectiveTo) return;
      if (state.transactions.some(item => item.recurringTemplateId === template.id && item.date?.startsWith(month))) return;
      const day = Math.min(Math.max(1, Number(template.day || 1)), daysInMonth(month));
      state.transactions.push({
        id: uid("entry"),
        date: `${month}-${String(day).padStart(2, "0")}`,
        type: template.type,
        group: template.group,
        category: template.category,
        amount: Number(template.amount || 0),
        paymentMethod: template.paymentMethod,
        counterparty: template.counterparty,
        note: template.note ? `${template.note}・固定收支自動帶入` : "固定收支自動帶入",
        source: "recurring",
        locked: false,
        recurringTemplateId: template.id,
        createdAt: new Date().toISOString()
      });
      created += 1;
    });
    return created;
  }

  function renderMonthOptions() {
    const select = $("#month-filter");
    const current = state.selectedMonth || currentMonth();
    const months = availableLedgerMonths();
    select.innerHTML = months.map(month => {
      return `<option value="${month}" ${month === current ? "selected" : ""}>${monthLabel(month)}</option>`;
    }).join("");
    if (![...select.options].some(option => option.value === current)) select.value = months.at(-1) || currentMonth();
    state.selectedMonth = select.value;
  }

  function availableLedgerMonths() {
    const months = new Set(Object.keys(SALARY_HISTORY.payroll || {}));
    (state?.transactions || HISTORY.transactions || []).forEach(item => {
      if (/^\d{4}-(0[1-9]|1[0-2])/.test(item.date || "")) months.add(item.date.slice(0, 7));
    });
    (state?.dayLabor || []).forEach(item => {
      if (/^\d{4}-(0[1-9]|1[0-2])/.test(item.date || "")) months.add(item.date.slice(0, 7));
    });
    months.add(currentMonth());
    return [...months].sort();
  }

  function renderSourceBanner() {
    const month = state.selectedMonth;
    const payroll = payrollForMonth(month);
    const historyCovered = (HISTORY.reconciliation || []).some(item => item.period === month);
    const banner = $("#source-banner");
    const reconcile = (HISTORY.reconciliation || []).find(item => item.period === month);
    const delta = Number(reconcile?.expenseDelta || 0);
    banner.classList.toggle("is-warning", !payroll.ready || delta !== 0);
    banner.innerHTML = historyCovered
      ? `<strong>${escapeHtml(monthLabel(month))}資料來源：</strong>${escapeHtml(HISTORY.source)} 每日明細＋${escapeHtml(payroll.source)}。正式員工薪資已排除 Excel 原值，避免重複。${delta ? ` 來源年報表與每日支出明細相差 ${money(Math.abs(delta))}，目前採每日明細。` : ""}`
      : `<strong>${escapeHtml(monthLabel(month))}為本機新增月份。</strong>一般收支與日薪工讀會儲存在這個瀏覽器；正式員工薪資來源：${escapeHtml(payroll.source)}。`;
  }

  function renderSummary() {
    const stats = monthStats(state.selectedMonth);
    $("#summary-income").textContent = money(stats.income);
    $("#summary-operating").textContent = money(stats.operating);
    $("#summary-payroll").textContent = money(stats.payroll.amount);
    $("#summary-payroll-source").textContent = stats.payroll.source;
    $("#summary-labor").textContent = money(stats.labor);
    $("#summary-net").textContent = money(stats.net);
    $("#summary-net-ratio").textContent = stats.income ? `結餘率 ${decimal(stats.net / stats.income * 100)}%` : "本月尚無收入";
    $(".summary-card.net").style.background = stats.net < 0
      ? "linear-gradient(145deg, #8f3f43, #b54e52)"
      : "linear-gradient(145deg, #1f5b45, #2d7b5c)";
  }

  function renderDataLists() {
    const type = $("#entry-type").value;
    const groupSelect = $("#entry-group");
    const previousGroup = groupSelect.value;
    groupSelect.innerHTML = GROUPS[type].map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    groupSelect.value = GROUPS[type].includes(previousGroup) ? previousGroup : GROUPS[type][0];
    const categories = activeCatalogItems(type, groupSelect.value);
    $("#category-options").innerHTML = categories.map(value => `<option value="${escapeHtml(value)}"></option>`).join("");
    const counterparties = [...new Set(state.transactions.map(item => item.counterparty).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    $("#counterparty-options").innerHTML = counterparties.map(value => `<option value="${escapeHtml(value)}"></option>`).join("");
  }

  function applyEntryCategoryDefaults() {
    const type = $("#entry-type").value;
    const group = $("#entry-group").value;
    const raw = $("#entry-category").value.trim();
    const mapped = mappedCatalogValue(type, group, raw);
    if (mapped.group && mapped.group !== group) {
      $("#entry-group").value = mapped.group;
      renderDataLists();
    }
    if (mapped.item && mapped.item !== raw) $("#entry-category").value = mapped.item;
    const setting = catalogSetting(type, mapped.group || group, mapped.item || raw);
    if (setting.defaultPaymentMethod) $("#entry-payment").value = setting.defaultPaymentMethod;
    if (type === "expense" && !$("#entry-counterparty").value.trim() && (mapped.item || raw)) $("#entry-counterparty").value = mapped.item || raw;
  }

  function renderCatalogFormGroups() {
    const type = $("#catalog-item-type").value;
    const select = $("#catalog-item-group");
    const previous = select.value;
    select.innerHTML = GROUPS[type].map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
    select.value = GROUPS[type].includes(previous) ? previous : GROUPS[type][0];
  }

  function renderCatalog() {
    renderCatalogFormGroups();
    const keyword = $("#catalog-search").value.trim().toLocaleLowerCase("zh-TW");
    const blocks = [];
    for (const type of ["income", "expense"]) {
      const cards = [];
      let total = 0;
      for (const group of GROUPS[type]) {
        const allItems = state.categoryCatalog?.[type]?.[group] || [];
        const items = allItems.filter(item => !keyword || item.toLocaleLowerCase("zh-TW").includes(keyword) || group.toLocaleLowerCase("zh-TW").includes(keyword));
        if (keyword && !items.length) continue;
        total += items.length;
        cards.push(`<article class="catalog-group-card ${type}"><header><h3>${escapeHtml(group)}</h3><span>${items.length.toLocaleString("zh-TW")} 項</span></header><div class="catalog-item-chips">${items.length ? items.map(item => {
          const setting = catalogSetting(type, group, item);
          return `<span class="catalog-item-chip${setting.active === false ? " is-inactive" : ""}">${escapeHtml(item)}${setting.aliases.length ? `<small>${setting.aliases.length} 個別名</small>` : ""}<button class="catalog-manage-trigger" type="button" data-catalog-type="${type}" data-catalog-group="${escapeHtml(group)}" data-catalog-item="${escapeHtml(item)}">管理</button></span>`;
        }).join("") : '<span class="catalog-item-chip">尚無項目，可在上方新增</span>'}</div></article>`);
      }
      if (cards.length) {
        const label = type === "income" ? "收入分類" : "支出分類";
        blocks.push(`<h3 class="catalog-section-title ${type}"><i aria-hidden="true">${type === "income" ? "收" : "支"}</i>${label}<small>${total.toLocaleString("zh-TW")} 個項目</small></h3>${cards.join("")}`);
      }
    }
    $("#catalog-groups").innerHTML = blocks.length ? blocks.join("") : '<p class="catalog-empty">找不到符合的項目，請改用其他關鍵字。</p>';
  }

  function renderQuickEntryPresets() {
    const rows = [...state.transactions]
      .filter(item => item.source === "manual")
      .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
    const seen = new Set();
    const presets = [];
    for (const item of rows) {
      const key = `${item.type}|${item.group}|${item.category}`;
      if (seen.has(key) || catalogSetting(item.type, item.group, item.category).active === false) continue;
      seen.add(key);
      presets.push(item);
      if (presets.length >= 8) break;
    }
    $("#quick-entry-presets").innerHTML = presets.length
      ? `<span class="catalog-empty">最近使用</span>${presets.map(item => `<button type="button" data-quick-type="${item.type}" data-quick-group="${escapeHtml(item.group)}" data-quick-category="${escapeHtml(item.category)}" data-quick-payment="${escapeHtml(item.paymentMethod || "")}" data-quick-counterparty="${escapeHtml(item.counterparty || "")}">${item.type === "income" ? "收" : "支"}・${escapeHtml(item.category)}</button>`).join("")}`
      : '<span class="catalog-empty">完成第一筆手動記帳後，常用項目會顯示在這裡。</span>';
  }

  function monthCloseChecks(month = state.selectedMonth) {
    const transactions = monthTransactions(month);
    const incomeDates = [...new Set(transactions.filter(item => item.type === "income" && Number(item.amount || 0) > 0).map(item => item.date))];
    const closedIncomeDates = incomeDates.filter(date => state.dailyClosures?.[date]?.locked);
    const differences = Object.values(state.reconciliations).filter(item => item.date?.startsWith(month) && Math.abs(Number(item.difference || 0)) > 1);
    const unclassified = transactions.filter(item => !item.group || !item.category || /未分類/.test(`${item.group}${item.category}`));
    const payroll = payrollForMonth(month);
    const recurringReady = state.recurringTemplates.filter(item => item.active !== false).every(template => state.transactions.some(item => item.recurringTemplateId === template.id && item.date?.startsWith(month)));
    return [
      { key: "payroll", done: payroll.ready, title: "正式員工薪資已完成", detail: payroll.ready ? `${payroll.source}・${money(payroll.amount)}` : "請先到薪資管理完成本月薪資月結" },
      { key: "days", done: incomeDates.length === closedIncomeDates.length, title: "所有營業日已完成每日關帳", detail: `${closedIncomeDates.length} / ${incomeDates.length} 個有營收日` },
      { key: "difference", done: differences.length === 0, title: "每日對帳沒有未說明差額", detail: differences.length ? `${differences.length} 天仍有差額` : "現金與非現金入帳核對正常" },
      { key: "classification", done: unclassified.length === 0, title: "所有收支都有正確分類", detail: unclassified.length ? `${unclassified.length} 筆仍需分類` : "沒有未分類資料" },
      { key: "recurring", done: recurringReady, title: "每月固定收支已套用", detail: recurringReady ? "固定項目已是最新" : "仍有固定收支尚未產生" }
    ];
  }

  async function renderSnapshotList() {
    const container = $("#snapshot-list");
    try {
      const snapshots = await window.BreakfastOperationsStore?.listSnapshots() || [];
      $("#safety-snapshot-count").textContent = `${snapshots.length} 版`;
      container.innerHTML = snapshots.length ? snapshots.slice(0, 30).map(item => `
        <article class="snapshot-item">
          <i aria-hidden="true">${item.moduleName === "payroll" ? "薪" : "帳"}</i>
          <div><strong>${escapeHtml(item.label || "安全快照")}</strong><small>${new Date(item.createdAt).toLocaleString("zh-TW")}・${Math.max(1, Math.round(Number(item.size || 0) / 1024)).toLocaleString("zh-TW")} KB${item.reason ? `・${escapeHtml(item.reason)}` : ""}</small></div>
          <div class="snapshot-actions"><button type="button" data-snapshot-restore="${escapeHtml(item.id)}">還原</button><button type="button" data-snapshot-delete="${escapeHtml(item.id)}">刪除</button></div>
        </article>`).join("") : '<p class="empty-state">尚無安全快照；系統每天會自動建立，也可以立即手動建立。</p>';
    } catch {
      container.innerHTML = '<p class="empty-state">這個瀏覽器無法開啟版本救援資料庫，仍可使用 JSON 備份。</p>';
    }
  }

  function renderSafety() {
    const month = state.selectedMonth;
    const checks = monthCloseChecks(month);
    const completed = checks.filter(item => item.done).length;
    const locked = isMonthLocked(month);
    const closedDays = Object.values(state.dailyClosures).filter(item => item.date?.startsWith(month) && item.locked).length;
    $("#daily-closed-count").textContent = `${closedDays} 天`;
    $("#month-close-blocker-count").textContent = `${checks.length - completed} 項`;
    $("#safety-audit-count").textContent = `${state.auditLog.length} 筆`;
    $("#month-close-progress").textContent = `${completed} / ${checks.length}`;
    $("#month-close-checklist").innerHTML = checks.map(item => `<article class="close-check-item${item.done ? " is-done" : ""}"><i aria-hidden="true">${item.done ? "✓" : "!"}</i><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><span>${item.done ? "完成" : "待處理"}</span></article>`).join("");
    const status = $("#month-lock-status");
    status.textContent = locked ? `${monthLabel(month)}已鎖定` : `${monthLabel(month)}尚未鎖定`;
    status.classList.toggle("is-locked", locked);
    $("#toggle-accounting-month-lock").textContent = locked ? "解除本月鎖定" : "完成本月月結並鎖定";
    ["#transaction-form", "#labor-form"].forEach(selector => document.querySelectorAll(`${selector} input, ${selector} select, ${selector} button`).forEach(control => { control.disabled = locked; }));
    $("#apply-recurring").disabled = locked;
    $("#copy-yesterday").disabled = locked;
    $("#copy-last-week").disabled = locked;
    const lastUndo = state.undoLog[0];
    $("#undo-accounting-action").disabled = !lastUndo || locked;
    $("#undo-accounting-action").textContent = lastUndo ? `復原：${lastUndo.action}` : "沒有可復原動作";
    $("#accounting-audit-log").innerHTML = state.auditLog.length ? state.auditLog.slice(0, 40).map(item => `<article class="audit-item"><i aria-hidden="true">記</i><div><strong>${escapeHtml(item.action)}</strong><small>${new Date(item.timestamp).toLocaleString("zh-TW")}・${escapeHtml(item.detail || item.month || "")}</small></div></article>`).join("") : '<p class="empty-state">新的修改、刪除、匯入與關帳動作會記錄在這裡。</p>';
    renderSnapshotList();
  }

  function openCatalogManager(type, group, item) {
    const setting = catalogSetting(type, group, item);
    $("#catalog-manage-original-type").value = type;
    $("#catalog-manage-original-group").value = group;
    $("#catalog-manage-original-name").value = item;
    $("#catalog-manage-group").innerHTML = GROUPS[type].map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    $("#catalog-manage-group").value = group;
    $("#catalog-manage-name").value = item;
    $("#catalog-manage-payment").value = setting.defaultPaymentMethod || "";
    $("#catalog-manage-active").value = String(setting.active !== false);
    $("#catalog-manage-aliases").value = setting.aliases.join("\n");
    renderCatalogMergeOptions(type, group, item);
    $("#catalog-manage-dialog").showModal();
  }

  function renderCatalogMergeOptions(type, group, item) {
    const selectedGroup = $("#catalog-manage-group").value || group;
    const options = (state.categoryCatalog?.[type]?.[selectedGroup] || []).filter(value => !(selectedGroup === group && value === item));
    $("#catalog-manage-merge").innerHTML = '<option value="">不合併</option>' + options.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
  }

  function undoLastAction() {
    const undo = state.undoLog.shift();
    if (!undo) return;
    if (undo.entityType === "transaction") {
      if (undo.operation === "remove") state.transactions = state.transactions.filter(item => item.id !== undo.payload.id);
      if (undo.operation === "restore" && !state.transactions.some(item => item.id === undo.payload.id)) state.transactions.push(undo.payload);
    }
    if (undo.entityType === "labor") {
      if (undo.operation === "remove") state.dayLabor = state.dayLabor.filter(item => item.id !== undo.payload.id);
      if (undo.operation === "restore" && !state.dayLabor.some(item => item.id === undo.payload.id)) state.dayLabor.push(undo.payload);
    }
    if (undo.entityType === "batch" && undo.operation === "remove") {
      const ids = new Set(undo.payload.ids || []);
      state.transactions = state.transactions.filter(item => !ids.has(item.id));
    }
    if (undo.entityType === "reconciliation") {
      if (undo.payload.previous) state.reconciliations[undo.payload.date] = undo.payload.previous;
      else delete state.reconciliations[undo.payload.date];
    }
    logAudit("復原動作", undo.action);
    saveState("上一個動作已復原");
    renderAll();
    toast(`已復原：${undo.action}`);
  }

  function copyEntriesFrom(daysBack) {
    const target = $("#entry-date").value || localDateString();
    if (!requireUnlockedDate(target, "複製記帳")) return;
    const sourceDate = new Date(`${target}T12:00:00`);
    sourceDate.setDate(sourceDate.getDate() - daysBack);
    const source = localDateString(sourceDate);
    const rows = state.transactions.filter(item => item.date === source && item.source === "manual" && !/薪資|工讀/.test(item.category || ""));
    if (!rows.length) { toast(`${source} 沒有可複製的手動記帳。`); return; }
    if (!window.confirm(`要把 ${source} 的 ${rows.length} 筆手動記帳複製到 ${target} 嗎？\n金額與付款方式會一併複製，完成後仍可逐筆修改。`)) return;
    const createdAt = new Date().toISOString();
    const copies = rows.map(item => ({ ...item, id: uid("copy"), date: target, source: "manual", recurringTemplateId: "", note: item.note ? `${item.note}・由 ${source} 複製` : `由 ${source} 複製`, createdAt }));
    state.transactions.push(...copies);
    pushUndo(`複製 ${source} 的 ${copies.length} 筆記帳`, "batch", "remove", { ids: copies.map(item => item.id) });
    logAudit("複製歷史記帳", `${source} → ${target}・${copies.length} 筆`, target.slice(0, 7));
    state.selectedMonth = target.slice(0, 7);
    selectedLedgerDate = target;
    saveState(`已複製 ${copies.length} 筆記帳`);
    renderAll();
    toast(`已複製 ${copies.length} 筆到 ${target}。`);
  }

  function renderLabor() {
    const rows = monthLabor(state.selectedMonth).sort((a, b) => b.date.localeCompare(a.date));
    $("#labor-list").innerHTML = rows.length ? rows.map(item => {
      const weekday = new Intl.DateTimeFormat("zh-TW", { weekday: "short" }).format(new Date(`${item.date}T12:00:00`));
      return `<div class="labor-item">
        <span class="labor-date">${escapeHtml(item.date.slice(5))}・${escapeHtml(weekday)}</span>
        <span class="labor-name"><strong>${escapeHtml(item.name)}</strong><small>日薪 ${money(item.rate)} × ${decimal(item.days, item.days % 1 ? 1 : 0)} 天${item.note ? `・${escapeHtml(item.note)}` : ""}</small></span>
        <span class="labor-amount">${money(item.amount)}</span>
        <button class="icon-btn delete-labor" type="button" data-id="${escapeHtml(item.id)}" aria-label="刪除 ${escapeHtml(item.name)} 的日薪紀錄">×</button>
      </div>`;
    }).join("") : `<p class="empty-state">這個月份尚無臨時工讀日薪紀錄。</p>`;
  }

  function localDateString(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function daysInMonth(month) {
    const [year, value] = month.split("-").map(Number);
    return new Date(year, value, 0).getDate();
  }

  function shortMoney(value) {
    const amount = Number(value || 0);
    if (Math.abs(amount) >= 10000) return `$${decimal(amount / 10000, 1)}萬`;
    return `$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(amount)}`;
  }

  function laborAsLedgerEntry(item) {
    return {
      id: item.id,
      originalId: item.id,
      kind: "labor",
      date: item.date,
      type: "expense",
      group: "人事成本",
      category: "臨時工讀日薪",
      counterparty: item.name,
      paymentMethod: "日薪",
      amount: Number(item.amount || 0),
      source: "labor",
      note: `${money(item.rate)} × ${decimal(item.days, item.days % 1 ? 1 : 0)} 天${item.note ? `・${item.note}` : ""}`,
      locked: isDateLocked(item.date)
    };
  }

  function filteredLedgerEntries() {
    const type = $("#type-filter").value;
    const keyword = $("#search-filter").value.trim().toLowerCase();
    const transactions = monthTransactions(state.selectedMonth).map(item => ({ ...item, locked: item.locked || isDateLocked(item.date), kind: "transaction", originalId: item.id }));
    const labor = monthLabor(state.selectedMonth).map(laborAsLedgerEntry);
    return [...transactions, ...labor]
      .filter(item => type === "all" || item.type === type)
      .filter(item => !keyword || [item.group, item.category, item.counterparty, item.note, item.paymentMethod].some(value => String(value || "").toLowerCase().includes(keyword)))
      .sort((a, b) => b.date.localeCompare(a.date) || String(a.type).localeCompare(String(b.type)) || String(a.category).localeCompare(String(b.category)));
  }

  function ledgerSourceLabel(item) {
    if (item.kind === "labor") return "日薪工讀";
    if (item.source === "recurring") return "固定收支";
    if (item.source === "accounting-backup") return "記帳備份";
    if (item.source === "uber-statement") return "Uber 對帳單";
    return /workbook/.test(item.source || "") ? `${item.date?.slice(0, 4) || "歷史"} 活頁簿` : "本機新增";
  }

  function renderLedgerDay(entries) {
    const month = state.selectedMonth;
    if (!selectedLedgerDate.startsWith(month)) {
      const today = localDateString();
      selectedLedgerDate = today.startsWith(month) ? today : `${month}-01`;
    }
    const rows = entries.filter(item => item.date === selectedLedgerDate);
    const income = rows.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = rows.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const net = income - expense;
    const weekday = new Intl.DateTimeFormat("zh-TW", { weekday: "long" }).format(new Date(`${selectedLedgerDate}T12:00:00`));
    const [year, value, day] = selectedLedgerDate.split("-");
    $("#ledger-day-title").textContent = `${year} 年 ${Number(value)} 月 ${Number(day)} 日・${weekday}`;
    $("#ledger-day-count").textContent = `${rows.length} 筆`;
    $("#ledger-day-income").textContent = money(income);
    $("#ledger-day-expense").textContent = money(expense);
    $("#ledger-day-net").textContent = money(net);
    $("#ledger-day-net").classList.toggle("negative", net < 0);
    $("#ledger-empty").hidden = rows.length > 0;
    $("#ledger-day-list").innerHTML = rows.map(item => `
      <article class="ledger-day-item ${item.type}">
        <span class="day-item-icon" aria-hidden="true">${item.type === "income" ? "入" : "出"}</span>
        <div class="day-item-copy">
          <span>${escapeHtml(item.group)}</span>
          <strong>${escapeHtml(item.category)}</strong>
          ${item.counterparty && item.counterparty !== item.category ? `<small>${escapeHtml(item.counterparty)}</small>` : ""}
          ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
          <div><span>${escapeHtml(item.paymentMethod || "未設定")}</span><span>${escapeHtml(ledgerSourceLabel(item))}</span>${item.receiptDataUrl ? `<button class="receipt-link" type="button" data-receipt-id="${escapeHtml(item.originalId)}">查看收據</button>` : ""}</div>
        </div>
        <strong class="day-item-amount">${item.type === "income" ? "+" : "−"}${money(item.amount)}</strong>
        ${item.locked ? '<span class="locked-label">不可修改</span>' : `<button class="icon-btn ${item.kind === "labor" ? "delete-calendar-labor" : "delete-calendar-transaction"}" type="button" data-id="${escapeHtml(item.originalId)}" aria-label="刪除這筆明細">×</button>`}
      </article>
    `).join("");
    renderDailyReconciliation(rows, income);
  }

  function renderDailyReconciliation(rows, recordedIncome) {
    const reconciliation = state.reconciliations[selectedLedgerDate];
    const closure = state.dailyClosures[selectedLedgerDate];
    const recordedCash = rows.filter(item => item.type === "income" && item.paymentMethod === "現金").reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const recordedNoncash = recordedIncome - recordedCash;
    $("#reconcile-cash").value = reconciliation ? Number(reconciliation.actualCash || 0) : "";
    $("#reconcile-noncash").value = reconciliation ? Number(reconciliation.actualNoncash || 0) : "";
    $("#reconcile-note").value = reconciliation?.note || "";
    $("#reconcile-cash").disabled = Boolean(closure?.locked);
    $("#reconcile-noncash").disabled = Boolean(closure?.locked);
    $("#reconcile-note").disabled = Boolean(closure?.locked);
    document.querySelector("#daily-reconciliation-form button[type='submit']").disabled = Boolean(closure?.locked) || isMonthLocked(selectedLedgerDate.slice(0, 7));
    $("#toggle-daily-close").textContent = closure?.locked ? "解除當日關帳" : "完成當日關帳";
    $("#toggle-daily-close").disabled = isMonthLocked(selectedLedgerDate.slice(0, 7));
    const closeStatus = $("#daily-close-status");
    closeStatus.className = `daily-close-status wide${closure?.locked ? " is-closed" : ""}`;
    closeStatus.textContent = closure?.locked ? `已於 ${new Date(closure.closedAt).toLocaleString("zh-TW")} 完成關帳${closure.reason ? `・${closure.reason}` : ""}` : "尚未關帳；完成後這一天的收支將暫時鎖定。";
    const result = $("#reconcile-result");
    if (!reconciliation) {
      result.className = "reconcile-result";
      result.textContent = `帳面收入：現金 ${money(recordedCash)}・非現金 ${money(recordedNoncash)}；尚未完成核對。`;
      return;
    }
    const difference = Number(reconciliation.difference || 0);
    result.className = `reconcile-result ${Math.abs(difference) <= 1 ? "is-balanced" : "is-difference"}`;
    result.textContent = Math.abs(difference) <= 1 ? "當日實際金額與帳面收入相符。" : `實際與帳面相差 ${money(difference)}，請確認漏登或入帳時間差。`;
  }

  function renderRecurringAndVendors() {
    const templates = state.recurringTemplates.filter(template => template.active !== false);
    $("#recurring-list").innerHTML = templates.length ? templates.map(template => `
      <article class="recurring-item">
        <span>${template.type === "income" ? "入" : "出"}</span>
        <div><strong>${escapeHtml(template.category)}</strong><small>每月 ${Number(template.day || 1)} 日・${escapeHtml(template.counterparty || template.group)}・${money(template.amount)}</small></div>
        <button class="icon-btn remove-recurring" type="button" data-id="${escapeHtml(template.id)}" aria-label="停用固定收支">×</button>
      </article>
    `).join("") : '<p class="empty-state">新增記帳時勾選「每月固定收支」，就會建立固定項目。</p>';

    const exceptions = accountingExceptions(state.selectedMonth);
    $("#accounting-exceptions").innerHTML = exceptions.length ? exceptions.map(item => `
      <article class="accounting-exception ${item.tone}"><span>${item.tone === "danger" ? "!" : "核"}</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div></article>
    `).join("") : '<article class="accounting-exception pass"><span>✓</span><div><strong>目前沒有待處理的記帳異常</strong><p>薪資串接、收據與每日對帳狀態正常。</p></div></article>';

    const vendors = new Map();
    monthTransactions(state.selectedMonth).filter(item => item.type === "expense" && item.counterparty).forEach(item => {
      vendors.set(item.counterparty, (vendors.get(item.counterparty) || 0) + Number(item.amount || 0));
    });
    const vendorRows = [...vendors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    $("#vendor-summary").innerHTML = vendorRows.length ? `<h3>本月主要供應商</h3>${vendorRows.map(([name, amount]) => `<div><span>${escapeHtml(name)}</span><strong>${money(amount)}</strong></div>`).join("")}` : "";
  }

  function renderLedger() {
    const entries = filteredLedgerEntries();
    const month = state.selectedMonth;
    const [year, value] = month.split("-").map(Number);
    const firstWeekday = (new Date(year, value - 1, 1).getDay() + 6) % 7;
    const totalDays = daysInMonth(month);
    const totalCells = Math.ceil((firstWeekday + totalDays) / 7) * 7;
    const today = localDateString();
    const grouped = new Map();
    entries.forEach(item => {
      if (!grouped.has(item.date)) grouped.set(item.date, []);
      grouped.get(item.date).push(item);
    });
    if (!selectedLedgerDate.startsWith(month)) selectedLedgerDate = today.startsWith(month) ? today : `${month}-01`;
    $("#ledger-calendar-month").textContent = monthLabel(month);
    const months = availableLedgerMonths();
    $("#calendar-prev-month").disabled = month <= months[0];
    $("#calendar-next-month").disabled = month >= months.at(-1);
    $("#ledger-calendar").innerHTML = Array.from({ length: totalCells }, (_, index) => {
      const day = index - firstWeekday + 1;
      if (day < 1 || day > totalDays) return '<span class="calendar-day is-outside" role="presentation"></span>';
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const rows = grouped.get(date) || [];
      const income = rows.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const expense = rows.filter(item => item.type === "expense").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const isWeekend = index % 7 >= 5;
      const aria = `${Number(value)} 月 ${day} 日，收入 ${money(income)}，支出 ${money(expense)}，共 ${rows.length} 筆`;
      return `
        <button class="calendar-day${isWeekend ? " is-weekend" : ""}${date === selectedLedgerDate ? " is-selected" : ""}${date === today ? " is-today" : ""}${rows.length ? " has-entries" : ""}${state.dailyClosures?.[date]?.locked ? " is-closed" : ""}" type="button" role="gridcell" data-calendar-date="${date}" aria-label="${escapeHtml(aria)}" aria-selected="${date === selectedLedgerDate}">
          <span class="calendar-day-top"><strong>${day}</strong>${rows.length ? `<small>${rows.length} 筆</small>` : ""}</span>
          <span class="calendar-amounts">
            ${income ? `<span class="income">＋${shortMoney(income)}</span>` : ""}
            ${expense ? `<span class="expense">−${shortMoney(expense)}</span>` : ""}
          </span>
          <span class="calendar-mobile-dots" aria-hidden="true">${income ? '<i class="income-dot"></i>' : ""}${expense ? '<i class="expense-dot"></i>' : ""}</span>
        </button>
      `;
    }).join("");
    renderLedgerDay(entries);
  }

  function renderAll() {
    renderSourceBanner();
    renderSummary();
    renderDataLists();
    renderCatalog();
    renderQuickEntryPresets();
    renderLabor();
    renderLedger();
    renderRecurringAndVendors();
    renderSafety();
    publishAccountingBridge();
  }

  function setFormDates(month = state.selectedMonth) {
    const today = localDateString();
    const preferred = today.startsWith(month) ? today : `${month}-01`;
    $("#entry-date").value = preferred;
    $("#labor-date").value = preferred;
  }

  async function compressedReceipt(file) {
    if (!file) return "";
    if (file.size > 8 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = objectUrl;
      });
      const maxSide = 1280;
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", .72);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function latestBackupImportDate() {
    const dates = state.transactions
      .filter(item => item.source === "accounting-backup" && /^20\d{2}-\d{2}-\d{2}$/.test(item.date || ""))
      .map(item => item.date)
      .sort();
    return dates.at(-1) || HISTORY.importedThrough || localDateString();
  }

  function shortFingerprint(value) {
    const text = String(value || "");
    return text ? `${text.slice(0, 8)}…${text.slice(-4)}` : "—";
  }

  function resetBackupImport(message = "尚未選擇檔案。") {
    pendingBackupImport = null;
    $("#backup-import-review").hidden = true;
    $("#backup-import-progress").className = "import-progress";
    $("#backup-import-progress").textContent = message;
    $("#backup-import-confirm").disabled = true;
    $("#backup-import-confirm").textContent = "確認匯入 0 筆";
  }

  function backupPreviewRows(analysis) {
    const rows = [
      ...analysis.auditRows.map(row => ({ ...row, previewStatus: row.status })),
      ...analysis.excludedRows.map(row => ({ ...row, previewStatus: "excluded" }))
    ];
    const order = { new: 0, excluded: 1, matched: 2 };
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (order[a.previewStatus] ?? 9) - (order[b.previewStatus] ?? 9));
  }

  function renderBackupImportReview(analysis) {
    const summary = analysis.summary;
    $("#backup-import-review").hidden = false;
    $("#backup-import-file-name").textContent = analysis.file.name;
    $("#backup-import-period").textContent = `${analysis.period.from} ～ ${analysis.period.through}`;
    $("#backup-import-fingerprint").textContent = shortFingerprint(analysis.file.fingerprint);
    $("#backup-import-eligible").textContent = summary.eligibleRows.toLocaleString("zh-TW");
    $("#backup-import-matched").textContent = summary.matchedRows.toLocaleString("zh-TW");
    $("#backup-import-new").textContent = summary.importedRows.toLocaleString("zh-TW");
    $("#backup-import-excluded").textContent = summary.excludedRows.toLocaleString("zh-TW");
    $("#backup-import-income").textContent = money(summary.importedIncome);
    $("#backup-import-expense").textContent = money(summary.importedExpense);
    $("#backup-import-confirm").disabled = summary.importedRows === 0;
    $("#backup-import-confirm").textContent = `確認匯入 ${summary.importedRows.toLocaleString("zh-TW")} 筆`;

    const warnings = [];
    if (analysis.previousBatch) warnings.push(`<p class="is-info"><b>這個檔案曾於 ${escapeHtml(new Date(analysis.previousBatch.importedAt).toLocaleString("zh-TW"))} 匯入。</b>系統仍已重新比對，只會顯示後來新增且尚未存在的明細。</p>`);
    if (summary.reviewRows) warnings.push(`<p class="is-warning"><b>${summary.reviewRows} 筆支出分類需要留意。</b>來源分類無法對應主要成本群組，將暫列為「雜支」，匯入後可在月曆明細核對。</p>`);
    if (!summary.importedRows) warnings.push('<p class="is-pass"><b>沒有需要新增的資料。</b>選定日期範圍內的有效收支都已存在。</p>');
    else warnings.push(`<p class="is-pass"><b>去重完成，可以安全匯入。</b>${summary.matchedRows} 筆既有資料不會重複；另排除 ${summary.transferRows} 筆互轉、${summary.adjustmentRows} 筆餘額調整及 ${summary.payrollRows} 筆正式薪資。</p>`);
    $("#backup-import-warnings").innerHTML = warnings.join("");

    const preview = backupPreviewRows(analysis);
    const visible = preview.slice(0, 300);
    $("#backup-import-preview-body").innerHTML = visible.map(row => {
      const status = row.previewStatus === "new" ? "預計新增" : row.previewStatus === "matched" ? "已存在" : "已排除";
      const type = row.type === "income" ? "收入" : row.type === "expense" ? "支出" : "—";
      return `<tr class="import-row-${escapeHtml(row.previewStatus)}"><td><span class="import-status ${escapeHtml(row.previewStatus)}">${status}</span></td><td>${escapeHtml(row.date || "—")}</td><td>${type}</td><td>${escapeHtml(row.group || "—")}</td><td>${escapeHtml(row.category || "—")}</td><td class="amount ${escapeHtml(row.type || "")}">${money(row.amount)}</td><td>${escapeHtml(row.reason || row.description || "")}</td></tr>`;
    }).join("") + (preview.length > visible.length ? `<tr><td colspan="7">另有 ${(preview.length - visible.length).toLocaleString("zh-TW")} 筆，請下載核對報告查看完整內容。</td></tr>` : "");
  }

  function backupImportErrorMessage(error) {
    const code = String(error?.message || error || "");
    if (code.includes("INVALID_EXTENSION")) return "請選擇副檔名為 .back 的記帳備份檔。";
    if (code.includes("SQLITE_NOT_FOUND")) return "檔案中找不到可讀取的記帳資料庫，請確認是原始 .back 備份。";
    if (code.includes("SQLITE_TRUNCATED")) return "備份內的資料庫不完整，可能是檔案尚未複製完成。";
    if (code.includes("SCHEMA_MISSING")) return "這份備份的資料表格式與目前支援的記帳 APP 不同。";
    if (code.includes("SQL_ENGINE")) return "記帳解析元件尚未載入，請重新整理頁面後再試一次。";
    return "無法解析這份備份，原有記帳資料沒有被修改。";
  }

  async function analyzeSelectedBackup() {
    const file = $("#accounting-backup-file").files[0];
    const startDate = $("#backup-import-start").value;
    if (!file) return resetBackupImport();
    if (file.size > 120 * 1024 * 1024) {
      resetBackupImport("檔案超過 120MB，請確認是否選到正確的記帳備份。");
      return;
    }
    pendingBackupImport = null;
    $("#backup-import-review").hidden = true;
    $("#backup-import-progress").className = "import-progress is-working";
    $("#backup-import-progress").textContent = `正在本機解析 ${file.name}，請稍候…`;
    try {
      const importer = window.BreakfastAccountingBackupImporter;
      if (!importer) throw new Error("SQL_ENGINE_MISSING");
      const analysis = await importer.analyzeFile({
        file,
        startDate,
        transactions: state.transactions,
        importBatches: state.importBatches
      });
      pendingBackupImport = analysis;
      renderBackupImportReview(analysis);
      $("#backup-import-progress").className = "import-progress is-ready";
      $("#backup-import-progress").textContent = `核對完成：${analysis.summary.importedRows} 筆預計新增，確認前尚未更動任何資料。`;
    } catch (error) {
      console.warn("Unable to analyze accounting backup", error);
      resetBackupImport(backupImportErrorMessage(error));
      $("#backup-import-progress").classList.add("is-error");
    }
  }

  function resetUberImport(message = "尚未選擇 Uber CSV 檔。") {
    pendingUberImport = null;
    $("#uber-import-review").hidden = true;
    $("#uber-import-progress").className = "import-progress";
    $("#uber-import-progress").textContent = message;
    $("#uber-import-confirm").disabled = true;
    $("#uber-import-confirm").textContent = "確認寫入 0 天";
  }

  function renderUberImportReview(analysis) {
    const summary = analysis.summary;
    $("#uber-import-review").hidden = false;
    $("#uber-import-file-name").textContent = analysis.file.name;
    $("#uber-import-period").textContent = `${analysis.period.from} ～ ${analysis.period.through}`;
    $("#uber-import-fingerprint").textContent = shortFingerprint(analysis.file.fingerprint);
    $("#uber-import-source-rows").textContent = summary.sourceRows.toLocaleString("zh-TW");
    $("#uber-import-net").textContent = money(summary.statementNet);
    $("#uber-import-fees").textContent = money(summary.serviceFees);
    $("#uber-import-matched").textContent = summary.matchedDays.toLocaleString("zh-TW");
    $("#uber-import-replaced").textContent = summary.replacedDays.toLocaleString("zh-TW");
    $("#uber-import-new").textContent = summary.newDays.toLocaleString("zh-TW");
    $("#uber-import-confirm").disabled = summary.importedRows === 0;
    $("#uber-import-confirm").textContent = `確認寫入 ${summary.importedRows.toLocaleString("zh-TW")} 天`;

    const warnings = [];
    if (analysis.previousBatch) warnings.push(`<p class="is-warning"><b>這份檔案曾於 ${escapeHtml(new Date(analysis.previousBatch.importedAt).toLocaleString("zh-TW"))} 匯入。</b>系統仍會依每日金額重新核對，不會重複寫入。</p>`);
    if (summary.invalidRows) warnings.push(`<p class="is-warning"><b>${summary.invalidRows} 列無法讀取。</b>日期或總金額格式不正確，未納入每日彙總；請下載核對報告查看列號。</p>`);
    if (summary.replacedDays) warnings.push(`<p class="is-warning"><b>${summary.replacedDays} 天與系統既有 Uber 金額不同。</b>確認後會先下載安全備份，再以這份官方對帳單的每日淨收入取代舊值。</p>`);
    if (!summary.importedRows) warnings.push('<p class="is-pass"><b>所有日期都已存在且金額相同。</b>不需要再次匯入，系統沒有修改任何資料。</p>');
    else warnings.push(`<p class="is-pass"><b>對帳單已完成逐日核對。</b>共 ${summary.sourceRows} 筆明細彙總為 ${summary.dailyRows} 天；${summary.refundRows} 筆退款、${summary.refundDisputeRows} 筆退款爭議均已依正負金額計入。</p>`);
    $("#uber-import-warnings").innerHTML = warnings.join("");

    $("#uber-import-preview-body").innerHTML = analysis.auditRows.map(row => {
      const status = row.status === "new" ? "預計新增" : row.status === "replace" ? "取代舊值" : "同額略過";
      const adjusted = Object.entries(row.statuses || {}).filter(([name]) => /退款|爭議/.test(name)).reduce((total, [, count]) => total + count, 0);
      return `<tr class="import-row-${escapeHtml(row.status)}"><td><span class="import-status ${escapeHtml(row.status)}">${status}</span></td><td>${escapeHtml(row.date)}</td><td>${row.detailRows}</td><td class="amount income">${money(row.amount)}</td><td>${row.existingRows ? money(row.existingAmount) : "—"}</td><td>${adjusted || "—"}</td><td>${escapeHtml(row.reason)}</td></tr>`;
    }).join("");
  }

  function uberImportErrorMessage(error) {
    const code = String(error?.message || error || "");
    if (code.includes("INVALID_EXTENSION")) return "請選擇 Uber 管理後台下載的 CSV 檔。";
    if (code.includes("HEADER_MISSING")) return "找不到「訂單日期」或「總金額」欄位，請確認是 Uber 台灣訂單對帳單。";
    if (code.includes("NO_VALID_ROWS")) return "檔案中沒有可用的訂單日期與總金額。";
    return "無法解析這份 Uber 對帳單，原有記帳資料沒有被修改。";
  }

  async function analyzeSelectedUberStatement() {
    const file = $("#uber-statement-file").files[0];
    if (!file) return resetUberImport();
    if (file.size > 30 * 1024 * 1024) {
      resetUberImport("檔案超過 30MB，請確認是否選到正確的 Uber CSV。");
      return;
    }
    pendingUberImport = null;
    $("#uber-import-review").hidden = true;
    $("#uber-import-progress").className = "import-progress is-working";
    $("#uber-import-progress").textContent = `正在本機彙總 ${file.name} 的每日 Uber 淨收入…`;
    try {
      const importer = window.BreakfastUberStatementImporter;
      if (!importer) throw new Error("IMPORTER_MISSING");
      const analysis = await importer.analyzeFile({ file, transactions: state.transactions, importBatches: state.importBatches });
      pendingUberImport = analysis;
      renderUberImportReview(analysis);
      $("#uber-import-progress").className = "import-progress is-ready";
      $("#uber-import-progress").textContent = `核對完成：${analysis.summary.dailyRows} 天、對帳單淨收入 ${money(analysis.summary.statementNet)}；確認前尚未更動資料。`;
    } catch (error) {
      console.warn("Unable to analyze Uber statement", error);
      resetUberImport(uberImportErrorMessage(error));
      $("#uber-import-progress").classList.add("is-error");
    }
  }

  function resetFoodpandaImport(message = "尚未選擇 foodpanda XLSX 檔。") {
    pendingFoodpandaImport = null;
    $("#foodpanda-import-review").hidden = true;
    $("#foodpanda-import-progress").className = "import-progress";
    $("#foodpanda-import-progress").textContent = message;
    $("#foodpanda-import-confirm").disabled = true;
    $("#foodpanda-import-confirm").textContent = "確認寫入 0 天";
  }

  function renderFoodpandaImportReview(analysis) {
    const summary = analysis.summary;
    $("#foodpanda-import-review").hidden = false;
    $("#foodpanda-import-file-name").textContent = analysis.file.name;
    $("#foodpanda-import-period").textContent = `${analysis.period.from} ～ ${analysis.period.through}`;
    $("#foodpanda-import-fingerprint").textContent = shortFingerprint(analysis.file.fingerprint);
    $("#foodpanda-import-source-rows").textContent = summary.sourceRows.toLocaleString("zh-TW");
    $("#foodpanda-import-net").textContent = money(summary.statementNet);
    $("#foodpanda-import-fees").textContent = money(summary.periodFees);
    $("#foodpanda-import-payout").textContent = money(summary.estimatedPayout);
    $("#foodpanda-import-matched").textContent = summary.matchedDays.toLocaleString("zh-TW");
    $("#foodpanda-import-replaced").textContent = summary.replacedDays.toLocaleString("zh-TW");
    $("#foodpanda-import-new").textContent = summary.newDays.toLocaleString("zh-TW");
    $("#foodpanda-import-confirm").disabled = summary.importedRows === 0;
    $("#foodpanda-import-confirm").textContent = `確認寫入 ${summary.importedRows.toLocaleString("zh-TW")} 天`;

    const warnings = [];
    if (analysis.previousBatch) warnings.push(`<p class="is-warning"><b>這份檔案曾於 ${escapeHtml(new Date(analysis.previousBatch.importedAt).toLocaleString("zh-TW"))} 匯入。</b>系統仍會重新逐日核對，不會重複寫入。</p>`);
    if (summary.invalidRows) warnings.push(`<p class="is-warning"><b>${summary.invalidRows} 列無法讀取。</b>日期或應付(應收)金額格式不正確，未納入每日彙總。</p>`);
    if (summary.duplicateOrderRows) warnings.push(`<p class="is-warning"><b>發現 ${summary.duplicateOrderRows} 筆重複訂單編號。</b>請先下載核對報告確認來源檔內容。</p>`);
    if (summary.periodFees) warnings.push(`<p class="is-warning"><b>附件另列整期費用 ${money(summary.periodFees)}。</b>此金額不會任意分攤到某一天；對帳單每日淨收入 ${money(summary.statementNet)}，扣除後預估撥款 ${money(summary.estimatedPayout)}。</p>`);
    if (summary.replacedDays) warnings.push(`<p class="is-warning"><b>${summary.replacedDays} 天與系統既有 foodpanda 金額不同。</b>確認後會先建立安全備份，再以官方對帳單的每日淨收入取代舊值。</p>`);
    if (!summary.importedRows) warnings.push('<p class="is-pass"><b>所有日期都已存在且金額相同。</b>不需要再次匯入，系統沒有修改任何資料。</p>');
    else warnings.push(`<p class="is-pass"><b>對帳單已完成逐日核對。</b>共 ${summary.sourceRows} 筆訂單彙總為 ${summary.dailyRows} 天，確認前尚未更動資料。</p>`);
    $("#foodpanda-import-warnings").innerHTML = warnings.join("");

    $("#foodpanda-import-preview-body").innerHTML = analysis.auditRows.map(row => {
      const status = row.status === "new" ? "預計新增" : row.status === "replace" ? "取代舊值" : "同額略過";
      const difference = row.amount - row.existingAmount;
      return `<tr class="import-row-${escapeHtml(row.status)}"><td><span class="import-status ${escapeHtml(row.status)}">${status}</span></td><td>${escapeHtml(row.date)}</td><td>${row.detailRows}</td><td class="amount income">${money(row.amount)}</td><td>${row.existingRows ? money(row.existingAmount) : "—"}</td><td class="amount ${Math.abs(difference) < .01 ? "" : difference > 0 ? "income" : "expense"}">${row.existingRows ? money(difference) : "—"}</td><td>${escapeHtml(row.reason)}</td></tr>`;
    }).join("");
  }

  function foodpandaImportErrorMessage(error) {
    const code = String(error?.message || error || "");
    if (code.includes("INVALID_EXTENSION")) return "請選擇 foodpanda 後台下載的 XLSX 對帳單。";
    if (code.includes("HEADER_MISSING")) return "找不到「訂單日期」或「foodpanda 應付(應收)金額」欄位，請確認檔案格式。";
    if (code.includes("NO_VALID_ROWS")) return "檔案中沒有可用的訂單日期與應付(應收)金額。";
    if (code.includes("DECOMPRESSION") || code.includes("XLSX_ZIP") || code.includes("XLSX_PART")) return "無法開啟這份 XLSX，請重新從 foodpanda 後台下載後再試。";
    return "無法解析這份 foodpanda 對帳單，原有記帳資料沒有被修改。";
  }

  async function analyzeSelectedFoodpandaStatement() {
    const file = $("#foodpanda-statement-file").files[0];
    if (!file) return resetFoodpandaImport();
    if (file.size > 30 * 1024 * 1024) {
      resetFoodpandaImport("檔案超過 30MB，請確認是否選到正確的 foodpanda XLSX。");
      return;
    }
    pendingFoodpandaImport = null;
    $("#foodpanda-import-review").hidden = true;
    $("#foodpanda-import-progress").className = "import-progress is-working";
    $("#foodpanda-import-progress").textContent = `正在本機解析 ${file.name} 的每日 foodpanda 淨收入…`;
    try {
      const importer = window.BreakfastFoodpandaStatementImporter;
      if (!importer) throw new Error("IMPORTER_MISSING");
      const analysis = await importer.analyzeFile({ file, transactions: state.transactions, importBatches: state.importBatches });
      pendingFoodpandaImport = analysis;
      renderFoodpandaImportReview(analysis);
      $("#foodpanda-import-progress").className = "import-progress is-ready";
      $("#foodpanda-import-progress").textContent = `核對完成：${analysis.summary.dailyRows} 天、對帳單每日淨收入 ${money(analysis.summary.statementNet)}；確認前尚未更動資料。`;
    } catch (error) {
      console.warn("Unable to analyze foodpanda statement", error);
      resetFoodpandaImport(foodpandaImportErrorMessage(error));
      $("#foodpanda-import-progress").classList.add("is-error");
    }
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function exportCsv() {
    const month = state.selectedMonth;
    const rows = monthTransactions(month).map(item => [item.date, item.type === "income" ? "收入" : "支出", item.group, item.category, item.counterparty || "", item.paymentMethod || "", item.amount, /workbook/.test(item.source || "") ? HISTORY.source : "本機新增", item.note || ""]);
    const payroll = payrollForMonth(month);
    if (payroll.amount) rows.push([`${month}-28`, "支出", "人事成本", "正式員工薪資", "薪資管理 APP", "月結串接", payroll.amount, payroll.source, "自動帶入，不與一般記帳重複"]);
    for (const item of monthLabor(month)) rows.push([item.date, "支出", "人事成本", "臨時工讀日薪", item.name, "日薪", item.amount, "記帳系統", item.note || ""]);
    const csv = "\ufeff" + [["日期", "收支", "分類", "項目", "對象", "付款方式", "金額", "來源", "備註"], ...rows].map(row => row.map(csvCell).join(",")).join("\n");
    download(csv, `初一食午記帳_${month}.csv`, "text/csv;charset=utf-8");
    toast("月份明細 CSV 已匯出。");
  }

  function changeLedgerMonth(month, preferredDate = "") {
    const months = availableLedgerMonths();
    if (month < months[0] || month > months.at(-1)) return;
    state.selectedMonth = month;
    selectedLedgerDate = preferredDate.startsWith(month) ? preferredDate : "";
    $("#month-filter").value = month;
    const created = materializeRecurring(month);
    saveState(created ? `已帶入 ${created} 筆固定收支` : "已儲存於本機");
    setFormDates();
    renderAll();
  }

  function shiftLedgerMonth(delta) {
    const [year, value] = state.selectedMonth.split("-").map(Number);
    const target = new Date(year, value - 1 + delta, 1);
    changeLedgerMonth(`${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`);
  }

  function installEvents() {
    document.querySelector(".accounting-mobile-menu").addEventListener("click", () => {
      setAccountingMenu(!document.body.classList.contains("accounting-menu-open"));
    });
    document.querySelector(".accounting-sidebar-backdrop").addEventListener("click", () => setAccountingMenu(false));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") setAccountingMenu(false);
    });
    document.querySelector(".accounting-page-tabs").addEventListener("click", event => {
      const tab = event.target.closest("[data-accounting-tab]");
      if (tab) setAccountingPage(tab.dataset.accountingTab);
    });
    document.querySelector(".accounting-page-tabs").addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      const tabs = [...document.querySelectorAll("[data-accounting-tab]")];
      const current = tabs.findIndex(tab => tab.getAttribute("aria-selected") === "true");
      let next = current;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % tabs.length;
      else next = (current - 1 + tabs.length) % tabs.length;
      event.preventDefault();
      setAccountingPage(tabs[next].dataset.accountingTab, { focus: true });
    });
    $("#month-filter").addEventListener("change", event => {
      changeLedgerMonth(event.target.value);
    });

    $("#accounting-cloud-login").addEventListener("click", () => {
      window.location.href = `/api/auth/authorize?returnTo=${encodeURIComponent("/accounting/?view=safety")}`;
    });
    $("#accounting-cloud-signout").addEventListener("click", async () => {
      if (typeof window.breakfastSignOut === "function") {
        await window.breakfastSignOut("/accounting/");
        return;
      }
      await fetch("/api/auth/signout", { method: "POST", credentials: "same-origin" }).catch(() => null);
      cloudUser = null;
      cloudReady = false;
      setCloudStatus("已登出；本機資料仍可繼續使用", "waiting");
      $("#accounting-cloud-signout").hidden = true;
      $("#accounting-cloud-login").textContent = "登入 Vercel";
    });
    $("#accounting-cloud-sync").addEventListener("click", () => syncAccountingCloud());
    $("#accounting-cloud-use-remote").addEventListener("click", async () => {
      if (!window.confirm("要以雲端資料取代目前本機版本嗎？系統會先建立可還原快照。")) return;
      const remote = await fetchCloudState().catch(error => {
        setCloudStatus(error instanceof Error ? error.message : "無法讀取雲端資料", "danger");
        return null;
      });
      if (remote) await adoptCloudState(remote);
    });
    $("#accounting-cloud-use-local").addEventListener("click", async () => {
      if (!window.confirm("確定以目前本機資料覆蓋雲端最新版？雲端舊版仍會保留每日備份。")) return;
      await syncAccountingCloud({ force: true });
    });

    $("#entry-type").addEventListener("change", () => {
      $("#entry-group").value = "";
      $("#entry-category").value = "";
      renderDataLists();
    });
    $("#entry-group").addEventListener("change", () => {
      $("#entry-category").value = "";
      renderDataLists();
    });
    $("#entry-category").addEventListener("change", applyEntryCategoryDefaults);
    $("#quick-entry-presets").addEventListener("click", event => {
      const button = event.target.closest("[data-quick-category]");
      if (!button) return;
      $("#entry-type").value = button.dataset.quickType;
      renderDataLists();
      $("#entry-group").value = button.dataset.quickGroup;
      renderDataLists();
      $("#entry-category").value = button.dataset.quickCategory;
      $("#entry-payment").value = button.dataset.quickPayment || $("#entry-payment").value;
      $("#entry-counterparty").value = button.dataset.quickCounterparty || "";
      $("#entry-amount").focus();
    });
    $("#copy-yesterday").addEventListener("click", () => copyEntriesFrom(1));
    $("#copy-last-week").addEventListener("click", () => copyEntriesFrom(7));
    $("#mobile-quick-add").addEventListener("click", () => {
      setAccountingPage("entry");
      window.setTimeout(() => $("#entry-amount").focus(), 60);
    });
    $("#catalog-item-type").addEventListener("change", renderCatalogFormGroups);
    $("#catalog-search").addEventListener("input", renderCatalog);
    $("#catalog-item-form").addEventListener("submit", event => {
      event.preventDefault();
      if (isMonthLocked()) { toast("本月已鎖定，請先解除鎖定再新增項目。" ); return; }
      const type = $("#catalog-item-type").value;
      const group = $("#catalog-item-group").value;
      const item = $("#catalog-item-name").value.trim();
      if (!item) return;
      if (!addCatalogItem(state.categoryCatalog, type, group, item)) {
        toast(`「${item}」已經存在於${group}。`);
        return;
      }
      $("#catalog-item-name").value = "";
      setCatalogSetting(type, group, item, { active: true, aliases: [], defaultPaymentMethod: "" });
      logAudit("新增分類項目", `${group}・${item}`);
      saveState("分類項目已更新");
      renderDataLists();
      renderCatalog();
      toast(`已在${group}新增「${item}」。`);
    });
    $("#catalog-groups").addEventListener("click", event => {
      const button = event.target.closest("[data-catalog-item]");
      if (button) openCatalogManager(button.dataset.catalogType, button.dataset.catalogGroup, button.dataset.catalogItem);
    });
    $("#catalog-manage-group").addEventListener("change", () => {
      renderCatalogMergeOptions($("#catalog-manage-original-type").value, $("#catalog-manage-original-group").value, $("#catalog-manage-original-name").value);
    });
    document.querySelectorAll('[data-close-dialog="catalog-manage-dialog"]').forEach(button => button.addEventListener("click", () => $("#catalog-manage-dialog").close()));
    $("#catalog-manage-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (isMonthLocked()) { toast("目前月份已鎖定，請先解除鎖定再調整分類。"); return; }
      const type = $("#catalog-manage-original-type").value;
      const originalGroup = $("#catalog-manage-original-group").value;
      const originalName = $("#catalog-manage-original-name").value;
      const targetGroup = $("#catalog-manage-group").value;
      const mergeTarget = $("#catalog-manage-merge").value;
      const targetName = mergeTarget || $("#catalog-manage-name").value.trim();
      if (!targetName) return;
      const aliases = $("#catalog-manage-aliases").value.split(/\r?\n|、/).map(value => value.trim()).filter(Boolean);
      const active = $("#catalog-manage-active").value === "true";
      const isMove = targetGroup !== originalGroup || targetName !== originalName;
      if (isMove) {
        const usage = state.transactions.filter(item => item.type === type && item.group === originalGroup && item.category === originalName).length;
        if (!window.confirm(`這項設定會把 ${usage} 筆歷史記帳從「${originalGroup}／${originalName}」改為「${targetGroup}／${targetName}」。確定繼續嗎？`)) return;
        await createSafetySnapshot("分類調整前快照", `${originalName} → ${targetName}`);
        state.transactions.forEach(item => {
          if (item.type !== type || item.group !== originalGroup || item.category !== originalName) return;
          item.group = targetGroup;
          item.category = targetName;
          if (item.counterparty === originalName) item.counterparty = targetName;
        });
        addCatalogItem(state.categoryCatalog, type, targetGroup, targetName);
        setCatalogSetting(type, originalGroup, originalName, { ...catalogSetting(type, originalGroup, originalName), active: false });
      }
      setCatalogSetting(type, targetGroup, targetName, {
        active,
        aliases: isMove ? [...aliases, originalName] : aliases,
        defaultPaymentMethod: $("#catalog-manage-payment").value
      });
      logAudit(mergeTarget ? "合併分類項目" : isMove ? "更名／移動分類項目" : "更新分類項目", `${originalGroup}／${originalName} → ${targetGroup}／${targetName}`);
      $("#catalog-manage-dialog").close();
      saveState("分類項目設定已儲存");
      renderAll();
      toast("分類與項目設定已更新。");
    });

    $("#transaction-form").addEventListener("submit", async event => {
      event.preventDefault();
      const type = $("#entry-type").value;
      const mapped = mappedCatalogValue(type, $("#entry-group").value.trim(), $("#entry-category").value.trim());
      const category = mapped.item;
      if (type === "expense" && /薪資|工讀/.test(category)) {
        toast("正式薪資會自動帶入；臨時工讀請使用右側的日薪表單。");
        return;
      }
      const entryDate = $("#entry-date").value;
      if (!requireUnlockedDate(entryDate, "新增記帳")) return;
      let receiptDataUrl = "";
      try {
        receiptDataUrl = await compressedReceipt($("#entry-receipt").files[0]);
      } catch {
        toast("收據照片過大或無法讀取，請改用 8MB 以下的 JPG／PNG。" );
        return;
      }
      const recurring = $("#entry-recurring").checked;
      const templateId = recurring ? uid("recurring") : "";
      const transaction = {
        id: uid("entry"),
        date: entryDate,
        type,
        group: mapped.group,
        category,
        amount: Number($("#entry-amount").value),
        paymentMethod: $("#entry-payment").value,
        counterparty: $("#entry-counterparty").value.trim(),
        note: $("#entry-note").value.trim(),
        receiptDataUrl,
        source: "manual",
        locked: false,
        recurringTemplateId: templateId,
        createdAt: new Date().toISOString()
      };
      if (!transaction.date || !transaction.group || !transaction.category || !(transaction.amount > 0)) return;
      state.transactions.push(transaction);
      pushUndo(`新增 ${transaction.category}`, "transaction", "remove", { id: transaction.id });
      logAudit("新增記帳", `${transaction.date}・${transaction.category}・${money(transaction.amount)}`, transaction.date.slice(0, 7));
      addCatalogItem(state.categoryCatalog, transaction.type, transaction.group, transaction.category);
      if (recurring) {
        state.recurringTemplates.push({
          id: templateId,
          type: transaction.type,
          group: transaction.group,
          category: transaction.category,
          amount: transaction.amount,
          paymentMethod: transaction.paymentMethod,
          counterparty: transaction.counterparty,
          note: transaction.note,
          day: Number(transaction.date.slice(-2)),
          effectiveFrom: transaction.date.slice(0, 7),
          effectiveTo: "",
          active: true,
          createdAt: new Date().toISOString()
        });
      }
      state.selectedMonth = transaction.date.slice(0, 7);
      selectedLedgerDate = transaction.date;
      $("#month-filter").value = state.selectedMonth;
      event.target.reset();
      $("#entry-type").value = type;
      setFormDates();
      saveState("已新增記帳");
      renderAll();
      toast(recurring ? "這筆記帳已儲存，並建立每月固定項目。" : "這筆記帳已儲存。");
    });

    $("#labor-rate-type").addEventListener("change", event => {
      $("#custom-rate-field").hidden = event.target.value !== "custom";
      $("#labor-custom-rate").required = event.target.value === "custom";
    });

    $("#labor-form").addEventListener("submit", event => {
      event.preventDefault();
      const rateType = $("#labor-rate-type").value;
      const rate = rateType === "custom" ? Number($("#labor-custom-rate").value) : Number(rateType);
      const days = Number($("#labor-days").value);
      const record = {
        id: uid("labor"),
        date: $("#labor-date").value,
        name: $("#labor-name").value.trim(),
        rate,
        days,
        amount: rate * days,
        note: $("#labor-note").value.trim(),
        createdAt: new Date().toISOString()
      };
      if (!record.date || !record.name || !(record.rate > 0) || !(record.days > 0)) return;
      if (!requireUnlockedDate(record.date, "新增日薪")) return;
      state.dayLabor.push(record);
      pushUndo(`新增 ${record.name} 日薪`, "labor", "remove", { id: record.id });
      logAudit("新增臨時工讀日薪", `${record.date}・${record.name}・${money(record.amount)}`, record.date.slice(0, 7));
      state.selectedMonth = record.date.slice(0, 7);
      selectedLedgerDate = record.date;
      $("#month-filter").value = state.selectedMonth;
      event.target.reset();
      $("#labor-days").value = "1";
      $("#labor-rate-type").value = "1000";
      $("#custom-rate-field").hidden = true;
      setFormDates();
      saveState("已新增日薪紀錄");
      renderAll();
      toast(`${record.name}的日薪 ${money(record.amount)} 已計入人事成本。`);
    });

    $("#labor-list").addEventListener("click", event => {
      const button = event.target.closest(".delete-labor");
      if (!button) return;
      const record = state.dayLabor.find(item => item.id === button.dataset.id);
      if (!record || !requireUnlockedDate(record.date, "刪除日薪") || !window.confirm(`確定刪除 ${record.name} ${record.date} 的日薪紀錄？`)) return;
      pushUndo(`刪除 ${record.name} 日薪`, "labor", "restore", { ...record });
      logAudit("刪除臨時工讀日薪", `${record.date}・${record.name}・${money(record.amount)}`, record.date.slice(0, 7));
      state.dayLabor = state.dayLabor.filter(item => item.id !== record.id);
      saveState("已刪除日薪紀錄");
      renderAll();
    });

    $("#ledger-calendar").addEventListener("click", event => {
      const day = event.target.closest("[data-calendar-date]");
      if (!day) return;
      selectedLedgerDate = day.dataset.calendarDate;
      renderLedger();
    });

    $("#ledger-day-list").addEventListener("click", event => {
      const receiptButton = event.target.closest("[data-receipt-id]");
      if (receiptButton) {
        const transaction = state.transactions.find(item => item.id === receiptButton.dataset.receiptId);
        if (transaction?.receiptDataUrl) window.open(transaction.receiptDataUrl, "_blank", "noopener");
        return;
      }
      const transactionButton = event.target.closest(".delete-calendar-transaction");
      if (transactionButton) {
        const transaction = state.transactions.find(item => item.id === transactionButton.dataset.id);
        if (!transaction || !requireUnlockedDate(transaction.date, "刪除記帳") || !window.confirm(`確定刪除 ${transaction.date}「${transaction.category}」${money(transaction.amount)}？`)) return;
        pushUndo(`刪除 ${transaction.category}`, "transaction", "restore", { ...transaction });
        logAudit("刪除記帳", `${transaction.date}・${transaction.category}・${money(transaction.amount)}`, transaction.date.slice(0, 7));
        state.transactions = state.transactions.filter(item => item.id !== transaction.id);
        saveState("已刪除記帳");
        renderAll();
        return;
      }
      const laborButton = event.target.closest(".delete-calendar-labor");
      if (!laborButton) return;
      const record = state.dayLabor.find(item => item.id === laborButton.dataset.id);
      if (!record || !requireUnlockedDate(record.date, "刪除日薪") || !window.confirm(`確定刪除 ${record.name} ${record.date} 的日薪紀錄？`)) return;
      pushUndo(`刪除 ${record.name} 日薪`, "labor", "restore", { ...record });
      logAudit("刪除臨時工讀日薪", `${record.date}・${record.name}・${money(record.amount)}`, record.date.slice(0, 7));
      state.dayLabor = state.dayLabor.filter(item => item.id !== record.id);
      saveState("已刪除日薪紀錄");
      renderAll();
    });

    $("#daily-reconciliation-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requireUnlockedDate(selectedLedgerDate, "儲存對帳")) return;
      const entries = filteredLedgerEntries().filter(item => item.date === selectedLedgerDate);
      const recordedIncome = entries.filter(item => item.type === "income").reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const actualCash = Number($("#reconcile-cash").value || 0);
      const actualNoncash = Number($("#reconcile-noncash").value || 0);
      const previous = state.reconciliations[selectedLedgerDate] ? { ...state.reconciliations[selectedLedgerDate] } : null;
      state.reconciliations[selectedLedgerDate] = {
        date: selectedLedgerDate,
        recordedIncome,
        actualCash,
        actualNoncash,
        difference: actualCash + actualNoncash - recordedIncome,
        note: $("#reconcile-note").value.trim(),
        reconciledAt: new Date().toISOString()
      };
      pushUndo(`更新 ${selectedLedgerDate} 對帳`, "reconciliation", "restore", { date: selectedLedgerDate, previous });
      logAudit("儲存每日對帳", `${selectedLedgerDate}・差額 ${money(state.reconciliations[selectedLedgerDate].difference)}`, selectedLedgerDate.slice(0, 7));
      saveState("每日對帳已儲存");
      renderAll();
      toast("當日現金與入帳核對已儲存。" );
    });
    $("#toggle-daily-close").addEventListener("click", () => {
      const current = state.dailyClosures[selectedLedgerDate];
      if (isMonthLocked(selectedLedgerDate.slice(0, 7))) { toast("本月已完成月結，無法變更每日關帳。"); return; }
      if (current?.locked) {
        const reason = window.prompt(`請輸入解除 ${selectedLedgerDate} 關帳的原因：`, "補登或修正當日資料");
        if (!reason?.trim()) return;
        state.dailyClosures[selectedLedgerDate] = { ...current, locked: false, reopenedAt: new Date().toISOString(), reopenReason: reason.trim() };
        logAudit("解除每日關帳", `${selectedLedgerDate}・${reason.trim()}`, selectedLedgerDate.slice(0, 7));
        saveState("每日關帳已解除");
        renderAll();
        return;
      }
      const reconciliation = state.reconciliations[selectedLedgerDate];
      if (!reconciliation) { toast("請先輸入實際現金與電子支付，儲存當日對帳後再關帳。"); return; }
      let reason = reconciliation.note || "核對完成";
      if (Math.abs(Number(reconciliation.difference || 0)) > 1) {
        reason = window.prompt(`當日仍有 ${money(reconciliation.difference)} 差額。若要關帳，請輸入差額原因：`, reconciliation.note || "平台入帳時間差");
        if (!reason?.trim()) return;
      }
      state.dailyClosures[selectedLedgerDate] = { date: selectedLedgerDate, locked: true, closedAt: new Date().toISOString(), reason: reason.trim() };
      logAudit("完成每日關帳", `${selectedLedgerDate}・差額 ${money(reconciliation.difference)}`, selectedLedgerDate.slice(0, 7));
      saveState("每日關帳已完成");
      renderAll();
      toast(`${selectedLedgerDate} 已完成關帳。`);
    });

    $("#apply-recurring").addEventListener("click", () => {
      if (isMonthLocked()) { toast(`${monthLabel(state.selectedMonth)}已鎖定。`); return; }
      const before = new Set(state.transactions.map(item => item.id));
      const created = materializeRecurring(state.selectedMonth);
      const ids = state.transactions.filter(item => !before.has(item.id)).map(item => item.id);
      if (ids.length) pushUndo(`套用 ${ids.length} 筆固定收支`, "batch", "remove", { ids });
      if (created) logAudit("套用每月固定收支", `${state.selectedMonth}・${created} 筆`);
      saveState(created ? `已新增 ${created} 筆固定收支` : "固定收支已是最新");
      renderAll();
      toast(created ? `已套用 ${created} 筆固定收支。` : "本月固定收支都已存在。" );
    });

    $("#recurring-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-recurring");
      if (!button || !window.confirm("確定停用這個每月固定項目？已產生的歷史記帳不會刪除。")) return;
      if (isMonthLocked()) { toast("本月已鎖定，請先解除鎖定。" ); return; }
      const template = state.recurringTemplates.find(item => item.id === button.dataset.id);
      if (template) {
        template.active = false;
        logAudit("停用每月固定收支", `${template.category}・${money(template.amount)}`);
      }
      saveState("固定項目已停用");
      renderAll();
    });

    $("#calendar-prev-month").addEventListener("click", () => shiftLedgerMonth(-1));
    $("#calendar-next-month").addEventListener("click", () => shiftLedgerMonth(1));
    $("#calendar-today").addEventListener("click", () => {
      const today = localDateString();
      const month = today.slice(0, 7);
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) changeLedgerMonth(month, today);
      else changeLedgerMonth(state.selectedMonth, `${state.selectedMonth}-01`);
    });
    $("#type-filter").addEventListener("change", renderLedger);
    $("#search-filter").addEventListener("input", renderLedger);
    $("#export-csv").addEventListener("click", exportCsv);
    $("#toggle-accounting-month-lock").addEventListener("click", async () => {
      const month = state.selectedMonth;
      const current = state.closedMonths[month] || {};
      if (current.locked) {
        const reason = window.prompt(`請輸入解除 ${monthLabel(month)} 月結鎖定的原因：`, "補登或修正帳務");
        if (!reason?.trim()) return;
        state.closedMonths[month] = { ...current, locked: false, unlockedAt: new Date().toISOString(), unlockReason: reason.trim() };
        logAudit("解除月份鎖定", `${month}・${reason.trim()}`, month);
        saveState("本月鎖定已解除");
        renderAll();
        return;
      }
      const checks = monthCloseChecks(month);
      const blockers = checks.filter(item => !item.done);
      let overrideReason = "";
      if (blockers.length) {
        overrideReason = window.prompt(`目前還有 ${blockers.length} 項月底檢查未完成：\n${blockers.map(item => `・${item.title}`).join("\n")}\n\n若確定仍要鎖定，請輸入主管覆核原因；取消或留白將停止。`, "");
        if (!overrideReason?.trim()) return;
      } else if (!window.confirm(`確定完成 ${monthLabel(month)} 月結並鎖定？鎖定後新增、刪除與匯入都會停止，直到輸入原因解除。`)) return;
      await createSafetySnapshot("月結鎖定前快照", month);
      state.closedMonths[month] = {
        locked: true,
        lockedAt: new Date().toISOString(),
        overrideReason: overrideReason.trim(),
        checks,
        snapshot: monthStats(month)
      };
      logAudit("完成月份月結", `${month}${overrideReason ? `・覆核：${overrideReason.trim()}` : ""}`, month);
      saveState("本月已完成月結");
      renderAll();
      toast(`${monthLabel(month)}已鎖定。`);
    });
    $("#create-snapshot-now").addEventListener("click", async () => {
      const label = window.prompt("請輸入這份安全快照的名稱：", `${monthLabel(state.selectedMonth)}手動快照`);
      if (!label?.trim()) return;
      await createSafetySnapshot(label.trim(), "使用者手動建立");
      renderSafety();
      toast("安全快照已建立。" );
    });
    $("#undo-accounting-action").addEventListener("click", () => {
      const undo = state.undoLog[0];
      if (!undo || !window.confirm(`確定要「${undo.action}」嗎？`)) return;
      undoLastAction();
    });
    $("#safety-download-backup").addEventListener("click", () => $("#download-backup").click());
    $("#refresh-snapshots").addEventListener("click", renderSnapshotList);
    $("#snapshot-list").addEventListener("click", async event => {
      const restoreButton = event.target.closest("[data-snapshot-restore]");
      const deleteButton = event.target.closest("[data-snapshot-delete]");
      if (deleteButton) {
        if (!window.confirm("確定刪除這份安全快照？刪除後無法復原。")) return;
        await window.BreakfastOperationsStore?.deleteSnapshot(deleteButton.dataset.snapshotDelete);
        renderSnapshotList();
        return;
      }
      if (!restoreButton) return;
      const snapshot = await window.BreakfastOperationsStore?.getSnapshot(restoreButton.dataset.snapshotRestore);
      if (!snapshot || !window.confirm(`確定還原「${snapshot.label}」？\n系統會先保存目前狀態，再以這份版本取代${snapshot.moduleName === "payroll" ? "薪資" : "記帳"}資料。`)) return;
      if (snapshot.moduleName === "accounting") {
        await createSafetySnapshot("版本還原前快照", snapshot.label);
        state = normalizeState(snapshot.payload);
        logAudit("還原安全快照", snapshot.label);
        selectedLedgerDate = "";
        saveState("安全快照已還原");
        renderMonthOptions();
        setFormDates();
        renderAll();
      } else if (snapshot.moduleName === "payroll") {
        await window.BreakfastOperationsStore?.createSnapshot("payroll", safeJson(PAYROLL_STORAGE_KEY), { label: "薪資版本還原前快照", reason: snapshot.label });
        localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(snapshot.payload));
        logAudit("還原薪資安全快照", snapshot.label);
        saveState("薪資快照已還原");
        renderAll();
      }
      toast("安全快照已成功還原。" );
    });
    $("#uber-statement-file").addEventListener("change", analyzeSelectedUberStatement);
    $("#uber-import-report").addEventListener("click", () => {
      if (!pendingUberImport) return;
      const basename = pendingUberImport.file.name.replace(/\.csv$/i, "");
      download(JSON.stringify(pendingUberImport.report, null, 2), `${basename}_Uber每日收入核對報告.json`, "application/json;charset=utf-8");
      toast("Uber 每日收入核對報告已下載。");
    });
    $("#uber-import-cancel").addEventListener("click", () => {
      $("#uber-statement-file").value = "";
      resetUberImport("已取消，本次沒有修改任何 Uber 收入。");
    });
    $("#uber-import-confirm").addEventListener("click", async () => {
      const analysis = pendingUberImport;
      if (!analysis?.transactions?.length) return;
      const lockedMonths = [...new Set(analysis.transactions.map(row => row.date.slice(0, 7)).filter(isMonthLocked))];
      if (lockedMonths.length) { toast(`${lockedMonths.join("、")} 已月結鎖定，無法匯入。`); return; }
      const summary = analysis.summary;
      const prompt = `確定寫入 ${summary.importedRows} 天 Uber 淨收入？\n對帳單合計 ${money(summary.statementNet)}。${summary.replacedDays ? `\n其中 ${summary.replacedDays} 天會取代系統舊金額。` : ""}\n\n系統會先下載一份匯入前的 JSON 安全備份。`;
      if (!window.confirm(prompt)) return;

      const importedAt = new Date().toISOString();
      const batchId = uid("uber-import");
      await createSafetySnapshot("Uber 匯入前快照", analysis.file.name);
      download(JSON.stringify(state, null, 2), `初一食午記帳_Uber匯入前備份_${importedAt.slice(0, 19).replaceAll(":", "-")}.json`, "application/json;charset=utf-8");
      const replacedIds = new Set(analysis.replacedTransactionIds || []);
      state.transactions = state.transactions.filter(row => !replacedIds.has(row.id));
      const importedRows = applyCatalogMappings(analysis.transactions).map(row => ({ ...row, importBatchId: batchId, importedAt }));
      state.transactions.push(...importedRows);
      syncCategoryCatalog(importedRows);
      state.importBatches.push({
        id: batchId,
        kind: "uber-statement",
        fileName: analysis.file.name,
        fingerprint: analysis.file.fingerprint,
        period: analysis.period,
        importedAt,
        sourceRows: summary.sourceRows,
        rowCount: importedRows.length,
        replacedDays: summary.replacedDays,
        replacedTransactionIds: [...replacedIds],
        netAmount: summary.statementNet,
        transactionIds: importedRows.map(row => row.id)
      });
      state.importedSources[`uber:${analysis.file.fingerprint}`] = {
        source: analysis.file.name,
        importedAt,
        rowCount: importedRows.length,
        replacedDays: summary.replacedDays
      };
      logAudit("匯入 Uber 對帳單", `${analysis.file.name}・${importedRows.length} 天・${money(summary.statementNet)}`);
      const lastDate = importedRows.map(row => row.date).sort().at(-1);
      if (lastDate) {
        state.selectedMonth = lastDate.slice(0, 7);
        selectedLedgerDate = lastDate;
      }
      saveState(`已寫入 ${importedRows.length} 天 Uber 收入`);
      renderMonthOptions();
      setFormDates();
      renderAll();
      $("#uber-statement-file").value = "";
      resetUberImport(`匯入完成：${analysis.file.name} 寫入 ${importedRows.length} 天，安全備份也已下載。`);
      $("#uber-import-progress").classList.add("is-success");
      toast(`已寫入 ${importedRows.length} 天 Uber 淨收入。`);
    });
    $("#foodpanda-statement-file").addEventListener("change", analyzeSelectedFoodpandaStatement);
    $("#foodpanda-import-report").addEventListener("click", () => {
      if (!pendingFoodpandaImport) return;
      const basename = pendingFoodpandaImport.file.name.replace(/\.xlsx$/i, "");
      download(JSON.stringify(pendingFoodpandaImport.report, null, 2), `${basename}_foodpanda每日收入核對報告.json`, "application/json;charset=utf-8");
      toast("foodpanda 每日收入核對報告已下載。");
    });
    $("#foodpanda-import-cancel").addEventListener("click", () => {
      $("#foodpanda-statement-file").value = "";
      resetFoodpandaImport("已取消，本次沒有修改任何 foodpanda 收入。");
    });
    $("#foodpanda-import-confirm").addEventListener("click", async () => {
      const analysis = pendingFoodpandaImport;
      if (!analysis?.transactions?.length) return;
      const lockedMonths = [...new Set(analysis.transactions.map(row => row.date.slice(0, 7)).filter(isMonthLocked))];
      if (lockedMonths.length) { toast(`${lockedMonths.join("、")} 已月結鎖定，無法匯入。`); return; }
      const summary = analysis.summary;
      const prompt = `確定寫入 ${summary.importedRows} 天 foodpanda 淨收入？\n每日淨收入合計 ${money(summary.statementNet)}。${summary.periodFees ? `\n另有整期費用 ${money(summary.periodFees)}，本次不分攤到每日收入。` : ""}${summary.replacedDays ? `\n其中 ${summary.replacedDays} 天會取代系統舊金額。` : ""}\n\n系統會先下載一份匯入前的 JSON 安全備份。`;
      if (!window.confirm(prompt)) return;

      const importedAt = new Date().toISOString();
      const batchId = uid("foodpanda-import");
      await createSafetySnapshot("foodpanda 匯入前快照", analysis.file.name);
      download(JSON.stringify(state, null, 2), `初一食午記帳_foodpanda匯入前備份_${importedAt.slice(0, 19).replaceAll(":", "-")}.json`, "application/json;charset=utf-8");
      const replacedIds = new Set(analysis.replacedTransactionIds || []);
      state.transactions = state.transactions.filter(row => !replacedIds.has(row.id));
      const importedRows = applyCatalogMappings(analysis.transactions).map(row => ({ ...row, importBatchId: batchId, importedAt }));
      state.transactions.push(...importedRows);
      syncCategoryCatalog(importedRows);
      state.importBatches.push({
        id: batchId,
        kind: "foodpanda-statement",
        fileName: analysis.file.name,
        fingerprint: analysis.file.fingerprint,
        period: analysis.period,
        importedAt,
        sourceRows: summary.sourceRows,
        rowCount: importedRows.length,
        replacedDays: summary.replacedDays,
        replacedTransactionIds: [...replacedIds],
        netAmount: summary.statementNet,
        periodFees: summary.periodFees,
        estimatedPayout: summary.estimatedPayout,
        transactionIds: importedRows.map(row => row.id)
      });
      state.importedSources[`foodpanda:${analysis.file.fingerprint}`] = {
        source: analysis.file.name,
        importedAt,
        rowCount: importedRows.length,
        replacedDays: summary.replacedDays,
        periodFees: summary.periodFees
      };
      logAudit("匯入 foodpanda 對帳單", `${analysis.file.name}・${importedRows.length} 天・${money(summary.statementNet)}`);
      const lastDate = importedRows.map(row => row.date).sort().at(-1);
      if (lastDate) {
        state.selectedMonth = lastDate.slice(0, 7);
        selectedLedgerDate = lastDate;
      }
      saveState(`已寫入 ${importedRows.length} 天 foodpanda 收入`);
      renderMonthOptions();
      setFormDates();
      renderAll();
      $("#foodpanda-statement-file").value = "";
      resetFoodpandaImport(`匯入完成：${analysis.file.name} 寫入 ${importedRows.length} 天，安全備份也已下載。`);
      $("#foodpanda-import-progress").classList.add("is-success");
      toast(`已寫入 ${importedRows.length} 天 foodpanda 淨收入。`);
    });
    $("#accounting-backup-file").addEventListener("change", analyzeSelectedBackup);
    $("#backup-import-start").addEventListener("change", () => {
      if ($("#accounting-backup-file").files[0]) analyzeSelectedBackup();
    });
    $("#backup-import-report").addEventListener("click", () => {
      if (!pendingBackupImport) return;
      const basename = pendingBackupImport.file.name.replace(/\.back$/i, "");
      download(JSON.stringify(pendingBackupImport.report, null, 2), `${basename}_匯入核對報告.json`, "application/json;charset=utf-8");
      toast("完整匯入核對報告已下載。");
    });
    $("#backup-import-cancel").addEventListener("click", () => {
      $("#accounting-backup-file").value = "";
      resetBackupImport("已取消，本次沒有修改任何記帳資料。");
    });
    $("#backup-import-confirm").addEventListener("click", async () => {
      const analysis = pendingBackupImport;
      if (!analysis?.transactions?.length) return;
      const lockedMonths = [...new Set(analysis.transactions.map(row => row.date.slice(0, 7)).filter(isMonthLocked))];
      if (lockedMonths.length) { toast(`${lockedMonths.join("、")} 已月結鎖定，無法匯入。`); return; }
      const summary = analysis.summary;
      const prompt = `確定匯入 ${summary.importedRows} 筆記帳？\n新增收入 ${money(summary.importedIncome)}、新增支出 ${money(summary.importedExpense)}。\n\n系統會先下載一份匯入前的 JSON 安全備份。`;
      if (!window.confirm(prompt)) return;

      const importedAt = new Date().toISOString();
      const batchId = uid("backup-import");
      await createSafetySnapshot("記帳匯入前快照", analysis.file.name);
      download(JSON.stringify(state, null, 2), `初一食午記帳_匯入前備份_${importedAt.slice(0, 19).replaceAll(":", "-")}.json`, "application/json;charset=utf-8");
      const importedRows = applyCatalogMappings(analysis.transactions).map(row => ({ ...row, importBatchId: batchId, importedAt }));
      state.transactions.push(...importedRows);
      syncCategoryCatalog(importedRows);
      state.importBatches.push({
        id: batchId,
        fileName: analysis.file.name,
        fingerprint: analysis.file.fingerprint,
        startDate: analysis.startDate,
        period: analysis.period,
        importedAt,
        rowCount: importedRows.length,
        income: summary.importedIncome,
        expense: summary.importedExpense,
        transactionIds: importedRows.map(row => row.id)
      });
      state.importedSources[`backup:${analysis.file.fingerprint}`] = {
        source: analysis.file.name,
        importedAt,
        rowCount: importedRows.length
      };
      logAudit("匯入記帳備份", `${analysis.file.name}・${importedRows.length} 筆`);
      const lastDate = importedRows.map(row => row.date).sort().at(-1);
      if (lastDate) {
        state.selectedMonth = lastDate.slice(0, 7);
        selectedLedgerDate = lastDate;
      }
      saveState(`已匯入 ${importedRows.length} 筆記帳`);
      renderMonthOptions();
      setFormDates();
      renderAll();
      $("#accounting-backup-file").value = "";
      $("#backup-import-start").value = latestBackupImportDate();
      resetBackupImport(`匯入完成：${analysis.file.name} 新增 ${importedRows.length} 筆，安全備份也已下載。`);
      $("#backup-import-progress").classList.add("is-success");
      toast(`已安全匯入 ${importedRows.length} 筆記帳。`);
    });
    $("#download-backup").addEventListener("click", () => {
      download(JSON.stringify(state, null, 2), `初一食午記帳備份_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      toast("記帳備份已下載。");
    });
    $("#restore-file").addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!Array.isArray(parsed.transactions) || !Array.isArray(parsed.dayLabor)) throw new Error("INVALID_BACKUP");
        const transactionChange = parsed.transactions.length - state.transactions.length;
        const laborChange = parsed.dayLabor.length - state.dayLabor.length;
        if (!window.confirm(`確定還原「${file.name}」？\n\n目前記帳 ${state.transactions.length.toLocaleString("zh-TW")} 筆 → 備份 ${parsed.transactions.length.toLocaleString("zh-TW")} 筆（${transactionChange >= 0 ? "+" : ""}${transactionChange}）\n目前日薪 ${state.dayLabor.length} 筆 → 備份 ${parsed.dayLabor.length} 筆（${laborChange >= 0 ? "+" : ""}${laborChange}）\n\n系統會先建立「還原前快照」再取代目前資料。`)) return;
        await createSafetySnapshot("JSON 還原前快照", file.name);
        state = normalizeState(parsed);
        logAudit("還原 JSON 備份", `${file.name}・${parsed.transactions.length} 筆記帳`);
        selectedLedgerDate = "";
        saveState("備份已還原");
        renderMonthOptions();
        setFormDates();
        renderAll();
        $("#restore-status").textContent = `已成功還原：${file.name}`;
        toast("記帳備份已還原。");
      } catch {
        $("#restore-status").textContent = "無法還原，請確認這是記帳系統下載的 JSON 備份。";
        toast("備份格式無法讀取。");
      } finally {
        event.target.value = "";
      }
    });

    window.addEventListener("storage", event => {
      if ([PAYROLL_STORAGE_KEY, PAYROLL_BRIDGE_KEY].includes(event.key)) renderAll();
    });
    window.addEventListener("breakfast-global-month", event => {
      const month = event.detail?.month;
      if (event.detail?.source === "accounting" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "") || month === state.selectedMonth) return;
      changeLedgerMonth(month);
      toast("月份已與其他系統同步。" );
    });
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const requestedPage = params.get("view");
    const savedPage = localStorage.getItem(ACCOUNTING_PAGE_KEY);
    const initialPage = ACCOUNTING_PAGES[requestedPage] ? requestedPage : ACCOUNTING_PAGES[savedPage] ? savedPage : "entry";
    const requestedMonth = params.get("month");
    const sharedMonth = window.BreakfastOperationsStore?.getGlobalMonth("");
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth || "")) state.selectedMonth = requestedMonth;
    else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sharedMonth || "")) state.selectedMonth = sharedMonth;
    renderMonthOptions();
    const requestedDate = params.get("date");
    if (requestedDate?.startsWith(state.selectedMonth)) selectedLedgerDate = requestedDate;
    if (["all", "income", "expense"].includes(params.get("type"))) $("#type-filter").value = params.get("type");
    if (params.get("search")) $("#search-filter").value = params.get("search");
    const created = materializeRecurring(state.selectedMonth);
    if (created) saveState(`已帶入 ${created} 筆固定收支`);
    $("#backup-import-start").value = latestBackupImportDate();
    resetBackupImport();
    resetUberImport();
    resetFoodpandaImport();
    setFormDates();
    installEvents();
    renderAll();
    setAccountingPage(initialPage, { updateUrl: false });
    window.BreakfastOperationsStore?.autoSnapshot("accounting", state, {
      label: "記帳每日自動快照",
      summary: { month: state.selectedMonth, transactions: state.transactions.length, labor: state.dayLabor.length }
    }).then(() => renderSnapshotList());
    initializeAccountingCloud();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
