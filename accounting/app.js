(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-accounting-v1";
  const PAYROLL_STORAGE_KEY = "breakfast-payroll-v1";
  const PAYROLL_BRIDGE_KEY = "breakfast-payroll-summary-v1";
  const ACCOUNTING_BRIDGE_KEY = "breakfast-accounting-summary-v1";
  const ACCOUNTING_PAGE_KEY = "breakfast-accounting-active-page-v1";
  const ACCOUNTING_CLOUD_META_KEY = "breakfast-accounting-cloud-meta-v1";
  const ACCOUNTING_CLOUD_DELAY = 60_000;
  const ACCOUNTING_CLOUD_RETRY_DELAYS = [5_000, 15_000, 45_000];
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
  const INSIGHTS = window.BreakfastOperationsInsights;
  const CLOUD_SYNC = window.BreakfastCloudSync;
  const moneyFormatter = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 });

  const GROUPS = {
    income: ["現金收入", "平台收入", "其他收入"],
    expense: ["食材成本", "飲品成本", "雜貨成本", "人事成本", "固定成本", "其他支出"]
  };
  const DEFAULT_CATEGORY_CATALOG = {
    income: {
      "現金收入": ["現金營業收入", "line Pay經營收入", "快一點line pay收入"],
      "平台收入": ["全支付收入", "街口支付收入", "Uber eat外送", "Foodpanda外送"],
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
  const CANONICAL_INCOME_GROUPS = {
    "現金營業收入": "現金收入",
    "line Pay經營收入": "現金收入",
    "快一點line pay收入": "現金收入",
    "全支付收入": "平台收入",
    "街口支付收入": "平台收入",
    "Uber eat外送": "平台收入",
    "Foodpanda外送": "平台收入",
    "其他收入": "其他收入",
    "廢油收入": "其他收入"
  };
  const REQUIRED_DAILY_INCOME_ITEMS = [
    "快一點line pay收入",
    "現金營業收入",
    "line Pay經營收入",
    "Uber eat外送",
    "Foodpanda外送"
  ];
  const REQUIRED_DAILY_INCOME_SHORT_LABELS = {
    "快一點line pay收入": "快一點",
    "現金營業收入": "現金",
    "line Pay經營收入": "LINE Pay",
    "Uber eat外送": "Uber",
    "Foodpanda外送": "Foodpanda"
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
    if (/foodpanda|熊貓/.test(key)) return "Foodpanda外送";
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
      const item = canonicalIncomeItem(row.category || row.counterparty || row.group);
      if (CANONICAL_INCOME_GROUPS[item]) return CANONICAL_INCOME_GROUPS[item];
      if (/uber|foodpanda|熊貓/.test(key)) return "平台收入";
      if (/linepay|line收入|快一點/.test(key)) return "現金收入";
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

  function normalizeTransactionNames(row) {
    if (!row || row.type !== "income") return { ...row };
    const category = canonicalIncomeItem(row.category || row.counterparty || row.group);
    const group = CANONICAL_INCOME_GROUPS[category] || catalogGroupForRow({ ...row, category });
    const canonicalCounterparty = canonicalIncomeItem(row.counterparty);
    const counterparty = CANONICAL_INCOME_GROUPS[canonicalCounterparty] ? canonicalCounterparty : row.counterparty;
    return { ...row, group, category, counterparty };
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
        for (const item of Array.isArray(saved?.[type]?.[group]) ? saved[type][group] : []) {
          const normalizedItem = type === "income" ? canonicalIncomeItem(item) : item;
          const normalizedGroup = type === "income" ? CANONICAL_INCOME_GROUPS[normalizedItem] || group : group;
          addCatalogItem(catalog, type, normalizedGroup, normalizedItem);
        }
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
  let reportGrain = "month";
  let reportAnchorDate = "";
  let pendingBackupImport = null;
  let pendingUberImport = null;
  let pendingFoodpandaImport = null;
  let cloudUser = null;
  let cloudReady = false;
  let cloudApplying = false;
  let cloudSyncing = false;
  let cloudSaveTimer = 0;
  let cloudRetryAttempt = 0;
  let cloudRemote = null;

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function initialState() {
    return {
      version: 6,
      selectedMonth: currentMonth(),
      transactions: (HISTORY.transactions || []).map(normalizeTransactionNames),
      categoryCatalog: buildDefaultCategoryCatalog(HISTORY.transactions || []),
      catalogItemSettings: {},
      dayLabor: [],
      recurringTemplates: [],
      payables: [],
      budgets: {},
      importBatches: [],
      reconciliations: {},
      dailyClosures: {},
      shopClosures: {},
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
      version: 6,
      transactions: Array.isArray(value?.transactions) ? value.transactions.map(normalizeTransactionNames) : base.transactions,
      dayLabor: Array.isArray(value?.dayLabor) ? value.dayLabor : [],
      recurringTemplates: Array.isArray(value?.recurringTemplates) ? value.recurringTemplates.map(normalizeTransactionNames) : [],
      payables: Array.isArray(value?.payables) ? value.payables.map(item => ({
        ...item,
        amount: Math.max(0, Number(item?.amount || 0)),
        status: item?.status === "paid" ? "paid" : "open"
      })) : [],
      budgets: value?.budgets && typeof value.budgets === "object" ? value.budgets : {},
      importBatches: Array.isArray(value?.importBatches) ? value.importBatches : [],
      reconciliations: value?.reconciliations && typeof value.reconciliations === "object" ? value.reconciliations : {},
      dailyClosures: value?.dailyClosures && typeof value.dailyClosures === "object" ? value.dailyClosures : {},
      shopClosures: value?.shopClosures && typeof value.shopClosures === "object" ? value.shopClosures : {},
      closedMonths: value?.closedMonths && typeof value.closedMonths === "object" ? value.closedMonths : {},
      auditLog: Array.isArray(value?.auditLog) ? value.auditLog.slice(0, 300) : [],
      undoLog: Array.isArray(value?.undoLog) ? value.undoLog.slice(0, 20) : [],
      catalogItemSettings: value?.catalogItemSettings && typeof value.catalogItemSettings === "object" ? value.catalogItemSettings : {},
      importedSources: { ...base.importedSources, ...(value?.importedSources || {}) }
    };
    if (HISTORY.id && !value?.importedSources?.[HISTORY.id]) {
      const existing = new Set(normalized.transactions.map(item => item.id));
      for (const item of HISTORY.transactions || []) {
        if (!existing.has(item.id)) normalized.transactions.push(normalizeTransactionNames(item));
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
      writeCloudMeta({ ...meta, dirty: true, lastLocalChangeAt: new Date().toISOString() });
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
    const defaults = { revision: "", dirty: false, lastSuccessAt: "", lastLocalChangeAt: "", retryCount: 0 };
    try {
      const value = JSON.parse(localStorage.getItem(ACCOUNTING_CLOUD_META_KEY) || "null");
      return value && typeof value === "object" ? { ...defaults, ...value } : defaults;
    } catch {
      return defaults;
    }
  }

  function writeCloudMeta(value) {
    localStorage.setItem(ACCOUNTING_CLOUD_META_KEY, JSON.stringify(value));
    updateCloudIndicators();
  }

  function updateCloudIndicators() {
    const meta = readCloudMeta();
    const lastSuccess = $("#accounting-cloud-last-success");
    const pending = $("#accounting-cloud-pending");
    const version = $("#accounting-cloud-version");
    const syncButton = $("#accounting-cloud-sync");
    if (lastSuccess) lastSuccess.textContent = CLOUD_SYNC?.relativeTime(meta.lastSuccessAt) || "尚未完成";
    if (pending) pending.textContent = meta.dirty ? (navigator.onLine ? "等待同步" : "離線保留中") : "沒有待同步";
    if (version) version.textContent = meta.revision ? meta.revision.slice(0, 8) : "—";
    if (syncButton) syncButton.disabled = cloudSyncing || !cloudUser;
  }

  function setCloudStatus(message, tone = "") {
    const status = $("#accounting-cloud-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
    updateCloudIndicators();
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
    if (!navigator.onLine) {
      setCloudStatus("目前離線，本機變更會在恢復網路後自動同步", "waiting");
      return;
    }
    setCloudStatus("本機已儲存，60 秒後同步雲端", "waiting");
    cloudSaveTimer = window.setTimeout(() => syncAccountingCloud(), ACCOUNTING_CLOUD_DELAY);
  }

  function scheduleCloudRetry(error) {
    if (!cloudUser || !cloudReady || !readCloudMeta().dirty || !CLOUD_SYNC?.isRetryable(error)) return;
    const delay = ACCOUNTING_CLOUD_RETRY_DELAYS[Math.min(cloudRetryAttempt, ACCOUNTING_CLOUD_RETRY_DELAYS.length - 1)];
    cloudRetryAttempt += 1;
    const meta = readCloudMeta();
    writeCloudMeta({ ...meta, retryCount: cloudRetryAttempt });
    window.clearTimeout(cloudSaveTimer);
    setCloudStatus(`同步暫時失敗，${Math.round(delay / 1000)} 秒後自動重試`, "waiting");
    cloudSaveTimer = window.setTimeout(() => syncAccountingCloud(), delay);
  }

  async function syncAccountingCloud(options = {}) {
    if (!cloudUser || !cloudReady) return false;
    if (cloudSyncing) return false;
    if (!navigator.onLine) {
      setCloudStatus("目前離線，本機資料已安全保留", "waiting");
      return false;
    }
    window.clearTimeout(cloudSaveTimer);
    cloudSyncing = true;
    const meta = readCloudMeta();
    setCloudStatus("正在壓縮並同步雲端…", "working");
    try {
      const request = await cloudRequestBody({
        state,
        baseRevision: options.force ? "" : meta.revision,
        force: options.force === true
      });
      const result = await CLOUD_SYNC.requestJson("/api/operations-state", {
        method: "PUT",
        headers: request.headers,
        body: request.body,
        attempts: 3
      });
      cloudRetryAttempt = 0;
      writeCloudMeta({
        ...meta,
        revision: result.revision || "",
        dirty: false,
        lastSuccessAt: result.updatedAt || new Date().toISOString(),
        retryCount: 0
      });
      cloudRemote = null;
      showCloudConflict(false);
      setCloudStatus(`雲端已同步・${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`, "success");
      return true;
    } catch (error) {
      if (error?.status === 409 || error?.code === "REVISION_CONFLICT") {
        cloudRemote = {
          revision: error.payload?.revision || "",
          updatedAt: error.payload?.updatedAt || "",
          updatedBy: error.payload?.updatedBy || ""
        };
        showCloudConflict(true);
        setCloudStatus("偵測到另一個雲端版本，請選擇保留哪一份", "danger");
      } else {
        setCloudStatus(error instanceof Error ? error.message : "雲端同步暫時失敗，本機資料仍安全", "danger");
        scheduleCloudRetry(error);
      }
      return false;
    } finally {
      cloudSyncing = false;
      updateCloudIndicators();
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
    writeCloudMeta({
      ...readCloudMeta(),
      revision: remote.revision || "",
      dirty: false,
      lastSuccessAt: remote.updatedAt || new Date().toISOString(),
      retryCount: 0
    });
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
    return CLOUD_SYNC.requestJson("/api/operations-state", { attempts: 3 });
  }

  async function initializeAccountingCloud() {
    setCloudStatus("正在檢查 Vercel 雲端登入…", "working");
    try {
      const session = await CLOUD_SYNC.requestJson("/api/auth/session", { attempts: 2 });
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
    if (type === "income") {
      const item = canonicalIncomeItem(value);
      if (CANONICAL_INCOME_GROUPS[item]) return { group: CANONICAL_INCOME_GROUPS[item], item };
    }
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
      const normalized = normalizeTransactionNames(row);
      const mapped = mappedCatalogValue(normalized.type, normalized.group, normalized.category || normalized.counterparty);
      return normalizeTransactionNames({ ...normalized, group: mapped.group || normalized.group, category: mapped.item || normalized.category });
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
    report: {
      eyebrow: "INCOME & EXPENSE REPORT",
      title: "收入、支出與廠商占比，一眼掌握。",
      description: "切換年報、月報與週報，用同一套資料查看收支趨勢、淨額、分類結構與各支出對象占比。"
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

  function dateFromLocalString(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0);
  }

  function reportAnchor() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportAnchorDate)) reportAnchorDate = `${state.selectedMonth}-01`;
    return dateFromLocalString(reportAnchorDate);
  }

  function reportRangeFor(grain = reportGrain, anchor = reportAnchor()) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    let start;
    let end;
    let label;
    if (grain === "year") {
      start = new Date(year, 0, 1, 12);
      end = new Date(year, 11, 31, 12);
      label = `${year} 年`;
    } else if (grain === "week") {
      const mondayOffset = (anchor.getDay() + 6) % 7;
      start = new Date(anchor);
      start.setDate(anchor.getDate() - mondayOffset);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      label = `${start.getFullYear()}/${start.getMonth() + 1}/${start.getDate()}－${end.getFullYear()}/${end.getMonth() + 1}/${end.getDate()}`;
    } else {
      start = new Date(year, month, 1, 12);
      end = new Date(year, month + 1, 0, 12);
      label = `${year} 年 ${month + 1} 月`;
    }
    return { grain, start: localDateString(start), end: localDateString(end), label };
  }

  function reportBuckets(range) {
    const buckets = [];
    const start = dateFromLocalString(range.start);
    const end = dateFromLocalString(range.end);
    if (range.grain === "year") {
      for (let month = 0; month < 12; month += 1) {
        const bucketStart = new Date(start.getFullYear(), month, 1, 12);
        const bucketEnd = new Date(start.getFullYear(), month + 1, 0, 12);
        buckets.push({ label: `${month + 1} 月`, start: localDateString(bucketStart), end: localDateString(bucketEnd) });
      }
      return buckets;
    }
    if (range.grain === "month") {
      const totalDays = end.getDate();
      for (let day = 1; day <= totalDays; day += 7) {
        const lastDay = Math.min(day + 6, totalDays);
        buckets.push({
          label: `${day}–${lastDay} 日`,
          start: localDateString(new Date(start.getFullYear(), start.getMonth(), day, 12)),
          end: localDateString(new Date(start.getFullYear(), start.getMonth(), lastDay, 12))
        });
      }
      return buckets;
    }
    const weekdayFormatter = new Intl.DateTimeFormat("zh-TW", { weekday: "short" });
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const date = localDateString(cursor);
      buckets.push({ label: `${cursor.getMonth() + 1}/${cursor.getDate()} ${weekdayFormatter.format(cursor)}`, start: date, end: date });
    }
    return buckets;
  }

  function reportMonthsBetween(start, end) {
    const first = dateFromLocalString(start);
    const last = dateFromLocalString(end);
    const months = [];
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1, 12);
    const limit = new Date(last.getFullYear(), last.getMonth(), 1, 12);
    while (cursor <= limit) {
      months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return months;
  }

  function reportEntriesBetween(start, end) {
    const transactions = applyCatalogMappings(state.transactions).map(item => ({
      ...item,
      amount: Number(item.amount || 0),
      reportKind: "transaction"
    }));
    const labor = state.dayLabor.map(item => ({
      id: item.id,
      date: item.date,
      type: "expense",
      group: "人事成本",
      category: "臨時工讀日薪",
      counterparty: item.name || "臨時工讀",
      amount: Number(item.amount || 0),
      reportKind: "labor"
    }));
    const payroll = reportMonthsBetween(start, end).flatMap(month => {
      const alreadyRecorded = transactions.some(item => item.type === "expense" && item.date?.startsWith(month) && /正式員工薪資/.test(item.category || ""));
      const summary = payrollForMonth(month);
      if (alreadyRecorded || !(summary.amount > 0)) return [];
      return [{
        id: `report-payroll-${month}`,
        date: `${month}-28`,
        type: "expense",
        group: "人事成本",
        category: "正式員工薪資",
        counterparty: "薪資管理 APP",
        amount: Number(summary.amount),
        reportKind: "payroll"
      }];
    });
    return [...transactions, ...labor, ...payroll]
      .filter(item => item.amount > 0 && item.date >= start && item.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function aggregateReportRows(entries, labelFor) {
    const values = new Map();
    entries.forEach(item => {
      const label = String(labelFor(item) || "未分類").trim() || "未分類";
      values.set(label, (values.get(label) || 0) + Number(item.amount || 0));
    });
    return [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
  }

  function collapsedReportRows(rows, limit = 8) {
    if (rows.length <= limit) return rows;
    const visible = rows.slice(0, limit - 1);
    visible.push([`其他 ${rows.length - limit + 1} 項`, rows.slice(limit - 1).reduce((sum, row) => sum + row[1], 0)]);
    return visible;
  }

  function renderReportRankedBars(selector, rows, denominator, tone = "navy", emptyText = "這個期間尚無資料。") {
    const target = $(selector);
    const visible = collapsedReportRows(rows);
    const maximum = Math.max(...visible.map(row => row[1]), 0);
    target.innerHTML = visible.length ? visible.map(([label, amount], index) => {
      const share = denominator ? amount / denominator * 100 : 0;
      const width = maximum ? Math.max(2, amount / maximum * 100) : 0;
      return `<article class="report-ranked-row ${tone}" aria-label="${escapeHtml(label)}，${money(amount)}，占比 ${decimal(share)}%">
        <div class="report-ranked-copy"><span><b>${index + 1}</b>${escapeHtml(label)}</span><strong>${money(amount)} <small>${decimal(share)}%</small></strong></div>
        <div class="report-ranked-track" aria-hidden="true"><i style="--report-bar-width:${width}%"></i></div>
      </article>`;
    }).join("") : `<p class="report-empty">${escapeHtml(emptyText)}</p>`;
  }

  function renderReportTrend(buckets, entries) {
    const values = buckets.map(bucket => {
      const rows = entries.filter(item => item.date >= bucket.start && item.date <= bucket.end);
      const income = rows.filter(item => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
      const expense = rows.filter(item => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
      return { ...bucket, income, expense, net: income - expense };
    });
    const maximum = Math.max(...values.flatMap(item => [item.income, item.expense]), 0);
    const chart = $("#report-trend-chart");
    chart.setAttribute("aria-label", values.map(item => `${item.label}收入${money(item.income)}、支出${money(item.expense)}、淨額${money(item.net)}`).join("；"));
    chart.innerHTML = maximum ? `
      <div class="report-chart-scale">最高 ${shortMoney(maximum)}</div>
      <div class="report-chart-columns">
        ${values.map(item => {
          const incomeHeight = item.income ? Math.max(3, item.income / maximum * 100) : 0;
          const expenseHeight = item.expense ? Math.max(3, item.expense / maximum * 100) : 0;
          return `<article class="report-chart-column" title="${escapeHtml(item.label)}｜收入 ${money(item.income)}｜支出 ${money(item.expense)}｜淨額 ${money(item.net)}">
            <div class="report-chart-bars" aria-hidden="true"><i class="income" style="--report-bar-height:${incomeHeight}%"></i><i class="expense" style="--report-bar-height:${expenseHeight}%"></i></div>
            <strong>${escapeHtml(item.label)}</strong>
            <small class="${item.net < 0 ? "negative" : ""}">${item.net >= 0 ? "+" : "−"}${shortMoney(Math.abs(item.net))}</small>
          </article>`;
        }).join("")}
      </div>` : '<p class="report-empty">這個期間尚無收入或支出。</p>';
  }

  function renderReportMatrix(buckets, entries) {
    const head = $("#report-matrix-head");
    const body = $("#report-matrix-body");
    head.innerHTML = `<tr><th>分類</th><th>收入／支出項目</th>${buckets.map(bucket => `<th>${escapeHtml(bucket.label)}</th>`).join("")}<th>期間合計</th><th>占比</th></tr>`;
    if (!entries.length) {
      body.innerHTML = `<tr><td colspan="${buckets.length + 4}" class="report-empty">這個期間尚無收入或支出資料。</td></tr>`;
      return;
    }
    const bucketValuesFor = rows => buckets.map(bucket => rows.filter(item => item.date >= bucket.start && item.date <= bucket.end).reduce((sum, item) => sum + item.amount, 0));
    const html = [];
    for (const type of ["income", "expense"]) {
      const typeRows = entries.filter(item => item.type === type);
      if (!typeRows.length) continue;
      const typeTotal = typeRows.reduce((sum, item) => sum + item.amount, 0);
      const typeBuckets = bucketValuesFor(typeRows);
      html.push(`<tr class="report-matrix-type ${type}"><th>${type === "income" ? "收入項目" : "支出項目"}</th><th aria-hidden="true"></th>${typeBuckets.map(value => `<th>${money(value)}</th>`).join("")}<th>${money(typeTotal)}</th><th>100%</th></tr>`);
      const configured = GROUPS[type] || [];
      const groups = [...new Set(typeRows.map(item => item.group || "未分類"))].sort((a, b) => {
        const first = configured.indexOf(a);
        const second = configured.indexOf(b);
        return (first < 0 ? 999 : first) - (second < 0 ? 999 : second) || a.localeCompare(b, "zh-Hant");
      });
      groups.forEach(group => {
        const groupRows = typeRows.filter(item => (item.group || "未分類") === group);
        const groupTotal = groupRows.reduce((sum, item) => sum + item.amount, 0);
        const groupBuckets = bucketValuesFor(groupRows);
        html.push(`<tr class="report-matrix-group ${type}"><th>${escapeHtml(group)}</th><th>分類小計</th>${groupBuckets.map(value => `<th>${money(value)}</th>`).join("")}<th>${money(groupTotal)}</th><th>${decimal(groupTotal / typeTotal * 100)}%</th></tr>`);
        const items = aggregateReportRows(groupRows, item => item.category || item.counterparty || "未分類");
        items.forEach(([category, total]) => {
          const itemRows = groupRows.filter(item => (item.category || item.counterparty || "未分類") === category);
          const itemBuckets = bucketValuesFor(itemRows);
          html.push(`<tr><td>${escapeHtml(group)}</td><td>${escapeHtml(category)}</td>${itemBuckets.map(value => `<td>${value ? money(value) : "—"}</td>`).join("")}<td><strong>${money(total)}</strong></td><td>${decimal(total / typeTotal * 100)}%</td></tr>`);
        });
      });
    }
    body.innerHTML = html.join("");
  }

  function renderReport() {
    const range = reportRangeFor();
    const buckets = reportBuckets(range);
    const entries = reportEntriesBetween(range.start, range.end);
    const incomeEntries = entries.filter(item => item.type === "income");
    const expenseEntries = entries.filter(item => item.type === "expense");
    const income = incomeEntries.reduce((sum, item) => sum + item.amount, 0);
    const expense = expenseEntries.reduce((sum, item) => sum + item.amount, 0);
    const net = income - expense;
    const expenseRatio = income ? expense / income * 100 : 0;
    const netRatio = income ? net / income * 100 : 0;

    document.querySelectorAll("[data-report-grain]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.reportGrain === reportGrain)));
    $("#report-period-label").textContent = range.label;
    $("#report-total-income").textContent = money(income);
    $("#report-income-note").textContent = `${incomeEntries.length.toLocaleString("zh-TW")} 筆收入`;
    $("#report-total-expense").textContent = money(expense);
    $("#report-expense-note").textContent = `${expenseEntries.length.toLocaleString("zh-TW")} 筆支出（含薪資）`;
    $("#report-total-net").textContent = money(net);
    $("#report-total-net").classList.toggle("negative", net < 0);
    $("#report-net-note").textContent = income ? `淨額率 ${decimal(netRatio)}%` : "期間內尚無收入";
    $("#report-expense-ratio").textContent = income ? `${decimal(expenseRatio)}%` : "—";
    $("#report-trend-subtitle").textContent = `${range.label}，每欄下方顯示該段期間淨額`;
    $("#report-matrix-subtitle").textContent = `${range.label}依${range.grain === "year" ? "月份" : range.grain === "month" ? "每 7 日" : "每日"}分欄；項目占比以同類型總額為分母。`;

    const importedThrough = HISTORY.importedThrough ? `歷史資料匯入至 ${escapeHtml(HISTORY.importedThrough)}` : "使用目前記帳資料";
    $("#report-source-banner").innerHTML = `<strong>${escapeHtml(range.label)}報表資料：</strong>${escapeHtml(HISTORY.source)}＋本機新增記帳＋薪資管理資料；${importedThrough}。正式員工薪資為月結資料，統一列於每月 28 日以利週報與明細互相核對。`;

    renderReportTrend(buckets, entries);
    renderReportRankedBars("#report-expense-groups", aggregateReportRows(expenseEntries, item => item.group), expense, "expense");
    renderReportRankedBars("#report-income-sources", aggregateReportRows(incomeEntries, item => item.category || item.group), income, "income");
    const vendorRows = aggregateReportRows(expenseEntries, item => item.counterparty || item.category || item.group);
    $("#report-vendor-count").textContent = `${vendorRows.length.toLocaleString("zh-TW")} 個對象`;
    renderReportRankedBars("#report-vendors", vendorRows, expense, "vendor");
    renderReportMatrix(buckets, entries);
  }

  function setReportGrain(grain) {
    if (!["year", "month", "week"].includes(grain)) return;
    reportGrain = grain;
    renderReport();
  }

  function shiftReportPeriod(delta) {
    const anchor = reportAnchor();
    if (reportGrain === "year") anchor.setFullYear(anchor.getFullYear() + delta);
    else if (reportGrain === "month") anchor.setMonth(anchor.getMonth() + delta);
    else anchor.setDate(anchor.getDate() + delta * 7);
    reportAnchorDate = localDateString(anchor);
    renderReport();
  }

  function resetReportPeriod() {
    const today = localDateString();
    reportAnchorDate = today.startsWith(state.selectedMonth) ? today : `${state.selectedMonth}-01`;
    renderReport();
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
    const openPayables = state.payables.filter(item => item.status !== "paid");
    const overduePayables = openPayables.filter(item => item.dueDate && item.dueDate < localDateString());
    const duplicateKeys = new Map();
    transactions.filter(item => ["manual", "batch-daily-income", "recurring"].includes(item.source)).forEach(item => {
      const key = [item.date, item.type, canonicalIncomeItem(item.category), Number(item.amount || 0), item.counterparty || ""].join("|");
      duplicateKeys.set(key, (duplicateKeys.get(key) || 0) + 1);
    });
    const duplicateCount = [...duplicateKeys.values()].filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0);
    const exceptions = [];
    if (!stats.payroll.ready) exceptions.push({ tone: "danger", title: "正式員工薪資尚未月結", detail: "記帳與分析目前無法取得本月正式薪資。" });
    if (unresolvedReconciliations.length) exceptions.push({ tone: "danger", title: `${unresolvedReconciliations.length} 天對帳有差額`, detail: unresolvedReconciliations.slice(0, 4).map(item => `${item.date.slice(5)} ${money(item.difference)}`).join("、") });
    if (unreceiptedLargeExpenses.length) exceptions.push({ tone: "warning", title: `${unreceiptedLargeExpenses.length} 筆大額支出沒有收據照片`, detail: "限本機新增且單筆達 $5,000 的支出。" });
    if (missingCounterparty.length) exceptions.push({ tone: "warning", title: `${missingCounterparty.length} 筆支出未填往來對象`, detail: "補上供應商後，成本分析與搜尋會更準確。" });
    if (duplicateCount) exceptions.push({ tone: "warning", title: `${duplicateCount} 筆疑似重複記帳`, detail: "同日、同項目、同金額且往來對象相同，請在月份明細確認。" });
    if (overduePayables.length) exceptions.push({ tone: "danger", title: `${overduePayables.length} 筆應付帳款已逾期`, detail: overduePayables.slice(0, 4).map(item => `${item.vendor} ${money(item.amount)}`).join("、") });
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
        const today = localDateString();
        const todayStatus = today.startsWith(month) ? requiredDailyIncomeStatus(today) : null;
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
          budget: budgetForMonth(month),
          todayRequiredIncome: todayStatus ? { missing: todayStatus.missing, isShopClosed: todayStatus.isShopClosed, isComplete: todayStatus.isComplete } : null,
          exceptions: accountingExceptions(month)
        };
      }
      const payload = { version: 3, generatedAt: new Date().toISOString(), months };
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
    if (undo.entityType === "shopClosure") {
      if (undo.payload.previous) state.shopClosures[undo.payload.date] = undo.payload.previous;
      else delete state.shopClosures[undo.payload.date];
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

  function requiredDailyIncomeStatus(date) {
    const recorded = new Set(state.transactions
      .filter(item => item.date === date && item.type === "income")
      .map(item => canonicalIncomeItem(item.category || item.counterparty || item.group))
      .filter(Boolean));
    const missing = REQUIRED_DAILY_INCOME_ITEMS.filter(item => !recorded.has(item));
    const isShopClosed = Boolean(state.shopClosures?.[date]?.closed);
    const isFuture = date > localDateString();
    return {
      recorded,
      missing,
      isShopClosed,
      isFuture,
      isComplete: !isShopClosed && !isFuture && missing.length === 0,
      shouldWarn: !isShopClosed && !isFuture && missing.length > 0
    };
  }

  function renderDailyIncomeChecklist() {
    const container = $("#daily-income-checklist");
    if (!container) return;
    const status = requiredDailyIncomeStatus(selectedLedgerDate);
    const statusText = status.isShopClosed
      ? "店休日，不檢查固定收入"
      : status.isFuture
        ? "日期尚未到，暫不提醒"
        : status.isComplete
          ? "5 項固定收入皆已記帳"
          : `漏記 ${status.missing.length} 項固定收入`;
    const tone = status.isShopClosed ? "is-shop-closed" : status.isFuture ? "is-future" : status.isComplete ? "is-complete" : "is-missing";
    container.className = `daily-income-checklist ${tone}`;
    container.innerHTML = `
      <div class="daily-income-checklist-heading">
        <div><p class="eyebrow">DAILY INCOME CHECK</p><h3>每日固定收入檢查</h3><strong>${escapeHtml(statusText)}</strong></div>
        <button class="secondary-btn" id="toggle-shop-closure" type="button"${isMonthLocked(selectedLedgerDate.slice(0, 7)) ? " disabled" : ""}>${status.isShopClosed ? "取消店休" : "標記店休"}</button>
      </div>
      <div class="daily-income-checklist-items">
        ${REQUIRED_DAILY_INCOME_ITEMS.map(item => {
          const isRecorded = status.recorded.has(item);
          const itemTone = status.isShopClosed ? "is-exempt" : isRecorded ? "is-recorded" : status.isFuture ? "is-pending" : "is-missing";
          const icon = status.isShopClosed ? "休" : isRecorded ? "✓" : status.isFuture ? "－" : "!";
          const label = status.isShopClosed ? "店休免檢查" : isRecorded ? "已記帳" : status.isFuture ? "待日期到" : "漏記帳";
          return `<span class="daily-income-check-item ${itemTone}"><i>${icon}</i><span><strong>${escapeHtml(item)}</strong><small>${label}</small></span></span>`;
        }).join("")}
      </div>`;
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
    renderDailyIncomeChecklist();
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

  const BATCH_DAILY_INCOME_ITEMS = [
    { key: "cash", item: "現金營業收入", group: "現金收入", paymentMethod: "現金" },
    { key: "quick", item: "快一點line pay收入", group: "現金收入", paymentMethod: "電子支付" },
    { key: "line", item: "line Pay經營收入", group: "現金收入", paymentMethod: "電子支付" },
    { key: "uber", item: "Uber eat外送", group: "平台收入", paymentMethod: "平台入帳" },
    { key: "foodpanda", item: "Foodpanda外送", group: "平台收入", paymentMethod: "平台入帳" }
  ];

  function dateRange(start, end, maximum = 31) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(end || "") || start > end) return [];
    const rows = [];
    const cursor = new Date(`${start}T12:00:00`);
    const finish = new Date(`${end}T12:00:00`);
    while (cursor <= finish && rows.length < maximum) {
      rows.push(localDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
  }

  function renderBatchIncomeRows() {
    const dates = dateRange($("#batch-income-start").value, $("#batch-income-end").value);
    if (!dates.length) {
      $("#batch-income-body").innerHTML = '<tr><td colspan="6">請選擇正確日期範圍，最多一次 31 天。</td></tr>';
      return;
    }
    $("#batch-income-body").innerHTML = dates.map(date => {
      const closed = Boolean(state.shopClosures?.[date]?.closed);
      const locked = isDateLocked(date);
      return `<tr data-batch-date="${date}" class="${closed ? "is-closed" : ""}"><td><strong>${date.slice(5)}</strong><small>${closed ? "店休" : locked ? "已鎖定" : ""}</small></td>${BATCH_DAILY_INCOME_ITEMS.map(definition => {
        const existing = state.transactions.find(item => item.date === date && item.type === "income" && canonicalIncomeItem(item.category || item.counterparty || item.group) === definition.item);
        return `<td><input type="number" min="0" step="1" inputmode="numeric" data-batch-income="${definition.key}" value="${existing ? Number(existing.amount || 0) : ""}" placeholder="${existing ? "已記帳" : "0"}" ${existing || closed || locked ? "disabled" : ""} title="${existing ? "此日已記帳，不會重複新增" : closed ? "店休日" : locked ? "日期已鎖定" : definition.item}" /></td>`;
      }).join("")}</tr>`;
    }).join("");
  }

  function renderPayables() {
    const today = localDateString();
    const open = state.payables.filter(item => item.status !== "paid").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const recentPaid = state.payables.filter(item => item.status === "paid" && String(item.paidDate || "").startsWith(state.selectedMonth)).slice(-5).reverse();
    const rows = [...open, ...recentPaid];
    const overdue = open.filter(item => item.dueDate && item.dueDate < today);
    const chip = $("#payable-summary-chip");
    chip.textContent = overdue.length ? `${overdue.length} 筆逾期・${open.length} 筆待付` : `${open.length} 筆待付款`;
    chip.className = `panel-chip ${overdue.length ? "red" : "gold"}`;
    $("#payable-list").innerHTML = rows.length ? rows.map(item => `
      <article class="payable-item ${item.status === "paid" ? "is-paid" : item.dueDate < today ? "is-overdue" : ""}">
        <div><strong>${escapeHtml(item.vendor)}・${escapeHtml(item.category)}</strong><small>${item.status === "paid" ? `${escapeHtml(item.paidDate || "")} 已付款` : `期限 ${escapeHtml(item.dueDate)}${item.note ? `・${escapeHtml(item.note)}` : ""}`}</small></div>
        <b>${money(item.amount)}</b>
        <div class="payable-actions">${item.status === "paid" ? '<span class="panel-chip">已入帳</span>' : `<button class="primary-btn pay-payable" type="button" data-id="${escapeHtml(item.id)}">付款並入帳</button><button class="danger-btn delete-payable" type="button" data-id="${escapeHtml(item.id)}">刪除</button>`}</div>
      </article>
    `).join("") : '<p class="empty-state">目前沒有待付款帳款。</p>';
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

  function adjacentMonth(month, delta) {
    const [year, value] = month.split("-").map(Number);
    const date = new Date(year, value - 1 + delta, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function budgetForMonth(month = state.selectedMonth) {
    return INSIGHTS.normalizeBudget(state.budgets?.[month], GROUPS.expense);
  }

  function renderBudgetInsights() {
    const month = state.selectedMonth;
    const budget = budgetForMonth(month);
    const stats = monthStats(month);
    $("#budget-target-income").value = budget.targetIncome || "";
    $("#budget-target-expense").value = budget.targetExpense || "";
    $("#budget-target-net").value = budget.targetNet || "";
    $("#budget-group-inputs").innerHTML = GROUPS.expense.map(group => `<label>${escapeHtml(group)}<input type="number" min="0" step="1000" inputmode="numeric" data-budget-group="${escapeHtml(group)}" value="${budget.groups[group] || ""}" /></label>`).join("");

    const groupTotals = Object.fromEntries(GROUPS.expense.map(group => [group, 0]));
    monthTransactions(month).filter(item => item.type === "expense").forEach(item => {
      const group = GROUPS.expense.includes(item.group) ? item.group : "其他支出";
      groupTotals[group] += Number(item.amount || 0);
    });
    groupTotals["人事成本"] += Number(stats.payroll.amount || 0) + Number(stats.labor || 0);
    const rows = INSIGHTS.buildBudgetRows(budget, { income: stats.income, expense: stats.expenses, net: stats.net }, groupTotals);
    const overCount = rows.filter(item => item.inverse ? item.ratio > 1 : false).length;
    const warningCount = rows.filter(item => item.ratio >= .85 && item.ratio <= 1).length;
    const configured = rows.length > 0;
    const chip = $("#budget-status-chip");
    chip.textContent = !configured ? "尚未設定" : overCount ? `${overCount} 項超標` : warningCount ? `${warningCount} 項接近上限` : "預算正常";
    chip.className = `panel-chip${overCount ? " red" : warningCount ? " gold" : ""}`;
    $("#budget-progress-list").innerHTML = rows.length ? rows.map(item => {
      const ratio = Math.round(item.ratio * 100);
      const tone = item.inverse && item.ratio > 1 ? "is-over" : item.ratio >= .85 ? "is-warning" : "";
      return `<article class="budget-progress-item ${tone}"><div><span>${escapeHtml(item.label)}</span><span>${money(item.actual)}／${money(item.limit)}・${ratio}%</span></div><div class="budget-progress-track" style="--budget-progress:${Math.min(100, Math.max(0, ratio))}%"><i></i></div></article>`;
    }).join("") : '<p class="empty-state">設定本月預算後，這裡會顯示執行進度。</p>';

    const currentExpenses = monthTransactions(month).filter(item => item.type === "expense");
    const previousExpenses = monthTransactions(adjacentMonth(month, -1)).filter(item => item.type === "expense");
    const anomalies = INSIGHTS.detectMonthAnomalies(currentExpenses, previousExpenses, { minimumAmount: 3000, threshold: .25 });
    $("#budget-anomalies").innerHTML = anomalies.length ? `<h3>本月採購升幅提醒</h3>${anomalies.slice(0, 6).map(item => `<article class="budget-anomaly"><strong>${escapeHtml(item.name)}增加 ${Math.round(item.change * 100)}%</strong>本月 ${money(item.amount)}・上月 ${money(item.previousAmount)}</article>`).join("")}` : '<p class="empty-state">目前沒有單一廠商或項目達到異常升幅門檻。</p>';
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
      const requiredStatus = requiredDailyIncomeStatus(date);
      const requiredLabel = requiredStatus.isShopClosed
        ? "店休"
        : requiredStatus.shouldWarn
          ? `漏記：${requiredStatus.missing.join("、")}`
          : requiredStatus.isComplete ? "5 項固定收入皆已記帳" : "尚未到檢查日期";
      const requiredNote = requiredStatus.isShopClosed
        ? '<span class="calendar-required-note is-shop-closed">店休</span>'
        : requiredStatus.shouldWarn
          ? `<span class="calendar-required-note is-missing" title="${escapeHtml(requiredLabel)}">缺 ${requiredStatus.missing.length}・${escapeHtml(requiredStatus.missing.map(item => REQUIRED_DAILY_INCOME_SHORT_LABELS[item]).join("、"))}</span>`
          : requiredStatus.isComplete ? '<span class="calendar-required-note is-complete">✓ 固定收入完整</span>' : "";
      const aria = `${Number(value)} 月 ${day} 日，收入 ${money(income)}，支出 ${money(expense)}，共 ${rows.length} 筆，${requiredLabel}`;
      return `
        <button class="calendar-day${isWeekend ? " is-weekend" : ""}${date === selectedLedgerDate ? " is-selected" : ""}${date === today ? " is-today" : ""}${rows.length ? " has-entries" : ""}${state.dailyClosures?.[date]?.locked ? " is-closed" : ""}${requiredStatus.isShopClosed ? " is-shop-closed" : ""}${requiredStatus.shouldWarn ? " has-missing-required" : ""}${requiredStatus.isComplete ? " has-complete-required" : ""}" type="button" role="gridcell" data-calendar-date="${date}" aria-label="${escapeHtml(aria)}" aria-selected="${date === selectedLedgerDate}">
          <span class="calendar-day-top"><strong>${day}</strong>${rows.length ? `<small>${rows.length} 筆</small>` : ""}</span>
          ${requiredNote}
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
    renderReport();
    renderDataLists();
    renderCatalog();
    renderQuickEntryPresets();
    renderLabor();
    renderLedger();
    renderRecurringAndVendors();
    renderPayables();
    renderBudgetInsights();
    renderSafety();
    publishAccountingBridge();
  }

  function setFormDates(month = state.selectedMonth) {
    const today = localDateString();
    const preferred = today.startsWith(month) ? today : `${month}-01`;
    $("#entry-date").value = preferred;
    $("#labor-date").value = preferred;
    $("#payable-due-date").value = preferred;
    $("#payable-group").innerHTML = GROUPS.expense.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join("");
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
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeReportFilename(value) {
    return String(value || "報表")
      .replace(/[\\/:*?\"<>|]/g, "-")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_");
  }

  function canvasJpeg(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("REPORT_JPEG_FAILED"));
    }, "image/jpeg", .94));
  }

  const REPORT_JPG_FONT = '"Microsoft JhengHei", "PingFang TC", sans-serif';

  function createReportCanvas(width, height) {
    const maxSide = 16000;
    const maxArea = 96_000_000;
    const scale = Math.min(2, maxSide / width, maxSide / height, Math.sqrt(maxArea / (width * height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#fffdf8";
    context.fillRect(0, 0, width, height);
    return { canvas, context, scale };
  }

  function fitReportText(context, value, maxWidth) {
    const text = String(value || "");
    if (context.measureText(text).width <= maxWidth) return text;
    let output = text;
    while (output.length > 1 && context.measureText(`${output}…`).width > maxWidth) output = output.slice(0, -1);
    return `${output}…`;
  }

  function drawReportText(context, value, x, y, { size = 13, weight = 500, color = "#17231e", align = "left", maxWidth } = {}) {
    context.save();
    context.font = `${weight} ${size}px ${REPORT_JPG_FONT}`;
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = "middle";
    const text = maxWidth ? fitReportText(context, value, maxWidth) : String(value || "");
    context.fillText(text, x, y);
    context.restore();
  }

  function drawReportHeading(context, target, width) {
    const eyebrow = target.querySelector(".eyebrow")?.textContent || "INCOME & EXPENSE REPORT";
    const title = target.querySelector("h2")?.textContent || "收入支出統計報表";
    const description = target.querySelector(".report-panel-heading > div > p:last-child")?.textContent || "";
    drawReportText(context, eyebrow, 36, 31, { size: 13, weight: 900, color: "#0e4b86" });
    drawReportText(context, title, 36, 71, { size: 31, weight: 900 });
    drawReportText(context, description, 36, 105, { size: 14, color: "#66746d", maxWidth: width - 72 });
    context.fillStyle = "#e9f2fa";
    context.fillRect(36, 124, width - 72, 34);
    drawReportText(context, `報表期間：${$("#report-period-label").textContent}`, 48, 141, { size: 14, weight: 900, color: "#31536f" });
    return 184;
  }

  function reportRankedCanvas(target) {
    const rows = [...target.querySelectorAll(".report-ranked-row")];
    const width = 760;
    const rowHeight = 72;
    const height = 210 + Math.max(1, rows.length) * rowHeight;
    const { canvas, context } = createReportCanvas(width, height);
    const startY = drawReportHeading(context, target, width);
    if (!rows.length) {
      drawReportText(context, target.querySelector(".report-empty")?.textContent || "這個期間尚無資料。", width / 2, startY + 44, { size: 14, color: "#66746d", align: "center" });
      return canvas;
    }
    const tone = target.id === "report-expense-groups-card" ? "#b54e52" : target.id === "report-income-sources-card" ? "#23684f" : "#c67c27";
    rows.forEach((row, index) => {
      const y = startY + index * rowHeight;
      const labelNode = row.querySelector(".report-ranked-copy > span")?.cloneNode(true);
      labelNode?.querySelector("b")?.remove();
      const label = labelNode?.textContent?.trim() || "未分類";
      const amount = row.querySelector(".report-ranked-copy > strong")?.textContent?.trim() || "$0 0%";
      const percentage = Number.parseFloat(row.querySelector(".report-ranked-track i")?.style.getPropertyValue("--report-bar-width") || "0");
      context.fillStyle = tone;
      context.beginPath();
      context.arc(51, y + 21, 16, 0, Math.PI * 2);
      context.fill();
      drawReportText(context, index + 1, 51, y + 21, { size: 12, weight: 900, color: "#ffffff", align: "center" });
      drawReportText(context, label, 78, y + 21, { size: 17, weight: 800, maxWidth: 390 });
      drawReportText(context, amount, width - 36, y + 21, { size: 16, weight: 800, align: "right" });
      context.fillStyle = "#eceae4";
      context.fillRect(78, y + 50, width - 114, 12);
      context.fillStyle = tone;
      context.fillRect(78, y + 50, (width - 114) * Math.max(0, Math.min(100, percentage)) / 100, 12);
    });
    return canvas;
  }

  function reportTrendCanvas(target) {
    const columns = [...target.querySelectorAll(".report-chart-column")].map(column => {
      const parts = String(column.title || "").split("｜");
      const numberAt = index => Number(String(parts[index] || "").replace(/[^\d.-]/g, "")) || 0;
      return { label: column.querySelector("strong")?.textContent || parts[0] || "", income: numberAt(1), expense: numberAt(2), net: column.querySelector("small")?.textContent || "" };
    });
    const chunks = [];
    for (let index = 0; index < columns.length; index += 6) chunks.push(columns.slice(index, index + 6));
    const width = 780;
    const plotHeight = 250;
    const sectionHeight = 350;
    const height = 210 + Math.max(1, chunks.length) * sectionHeight;
    const { canvas, context } = createReportCanvas(width, height);
    const startY = drawReportHeading(context, target, width);
    const plotLeft = 78;
    const plotRight = width - 30;
    const maximum = Math.max(...columns.flatMap(item => [item.income, item.expense]), 0);
    if (!columns.length || !maximum) {
      drawReportText(context, "這個期間尚無收入或支出。", width / 2, startY + 80, { size: 17, color: "#66746d", align: "center" });
      return canvas;
    }
    chunks.forEach((chunk, chunkIndex) => {
      const plotTop = startY + 16 + chunkIndex * sectionHeight;
      for (let step = 0; step <= 4; step += 1) {
        const y = plotTop + plotHeight * step / 4;
        context.strokeStyle = "#e4e0d7";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(plotLeft, y);
        context.lineTo(plotRight, y);
        context.stroke();
        drawReportText(context, shortMoney(maximum * (4 - step) / 4), plotLeft - 10, y, { size: 12, color: "#66746d", align: "right" });
      }
      const slot = (plotRight - plotLeft) / chunk.length;
      chunk.forEach((item, index) => {
        const center = plotLeft + slot * (index + .5);
        const barWidth = Math.min(30, slot * .26);
        const incomeHeight = item.income / maximum * plotHeight;
        const expenseHeight = item.expense / maximum * plotHeight;
        context.fillStyle = "#23684f";
        context.fillRect(center - barWidth - 3, plotTop + plotHeight - incomeHeight, barWidth, incomeHeight);
        context.fillStyle = "#b54e52";
        context.fillRect(center + 3, plotTop + plotHeight - expenseHeight, barWidth, expenseHeight);
        drawReportText(context, item.label, center, plotTop + plotHeight + 24, { size: 14, weight: 800, align: "center", maxWidth: slot - 6 });
        drawReportText(context, item.net, center, plotTop + plotHeight + 50, { size: 13, weight: 900, color: item.net.startsWith("−") ? "#b54e52" : "#23684f", align: "center", maxWidth: slot - 6 });
      });
    });
    context.fillStyle = "#23684f";
    context.fillRect(width - 208, 28, 11, 11);
    drawReportText(context, "收入", width - 190, 34, { size: 13, weight: 800, color: "#66746d" });
    context.fillStyle = "#b54e52";
    context.fillRect(width - 125, 28, 11, 11);
    drawReportText(context, "支出", width - 107, 34, { size: 13, weight: 800, color: "#66746d" });
    return canvas;
  }

  function reportMatrixCanvas(target) {
    const table = target.querySelector(".report-matrix-table");
    const rows = [...table.querySelectorAll("tr")];
    const columnCount = Math.max(...rows.map(row => row.children.length), 0);
    const periodColumns = Array.from({ length: Math.max(0, columnCount - 4) }, (_, index) => index + 2);
    const periodChunks = [];
    for (let index = 0; index < periodColumns.length; index += 3) periodChunks.push(periodColumns.slice(index, index + 3));
    if (!periodChunks.length) periodChunks.push([]);
    const summaryColumns = columnCount >= 2 ? [columnCount - 2, columnCount - 1] : [];
    const columnWidths = Array.from({ length: columnCount }, (_, index) => index === 0 ? 110 : index === 1 ? 190 : 120);
    const selectedWidth = 110 + 190 + (Math.min(3, periodColumns.length) + summaryColumns.length) * 120;
    const width = selectedWidth + 72;
    const rowHeight = 54;
    const sectionLabelHeight = 40;
    const sectionGap = 28;
    const sectionHeight = sectionLabelHeight + rows.length * rowHeight + sectionGap;
    const height = 204 + periodChunks.length * sectionHeight;
    const { canvas, context, scale } = createReportCanvas(width, height);
    const startY = drawReportHeading(context, target, width);
    const tableX = 36;
    periodChunks.forEach((periodChunk, chunkIndex) => {
      const selectedColumns = [0, 1, ...periodChunk, ...summaryColumns];
      const blockY = startY + chunkIndex * sectionHeight;
      const firstLabel = table.querySelector(`thead th:nth-child(${(periodChunk[0] ?? 2) + 1})`)?.textContent || "期間";
      const lastLabel = table.querySelector(`thead th:nth-child(${(periodChunk.at(-1) ?? 2) + 1})`)?.textContent || firstLabel;
      drawReportText(context, `分段 ${chunkIndex + 1}/${periodChunks.length}：${firstLabel}${firstLabel === lastLabel ? "" : ` ～ ${lastLabel}`}（右側保留期間合計與占比）`, tableX, blockY + 18, { size: 16, weight: 900, color: "#31536f", maxWidth: width - 72 });
      rows.forEach((row, rowIndex) => {
        const isHeader = row.parentElement?.tagName === "THEAD";
        const isIncomeType = row.classList.contains("report-matrix-type") && row.classList.contains("income");
        const isExpenseType = row.classList.contains("report-matrix-type") && row.classList.contains("expense");
        const isIncomeGroup = row.classList.contains("report-matrix-group") && row.classList.contains("income");
        const isExpenseGroup = row.classList.contains("report-matrix-group") && row.classList.contains("expense");
        const background = isIncomeType ? "#23684f" : isExpenseType ? "#b54e52" : isIncomeGroup ? "#e6f2eb" : isExpenseGroup ? "#fbe9e7" : isHeader ? "#f7f4ec" : rowIndex % 2 ? "#fffdf8" : "#faf9f5";
        const foreground = isIncomeType || isExpenseType ? "#ffffff" : "#17231e";
        const y = blockY + sectionLabelHeight + rowIndex * rowHeight;
        const cells = Array(columnCount).fill(null);
        let logicalColumn = 0;
        [...row.children].forEach(cell => {
          const span = Math.max(1, Number(cell.colSpan || 1));
          cells[logicalColumn] = cell;
          logicalColumn += span;
        });
        if (row.children.length === 1 && Number(row.children[0].colSpan || 1) > 1) {
          context.fillStyle = background;
          context.fillRect(tableX, y, selectedWidth, rowHeight);
          context.strokeStyle = "#d9d4c7";
          context.strokeRect(tableX, y, selectedWidth, rowHeight);
          drawReportText(context, row.children[0].textContent?.trim() || "", tableX + selectedWidth / 2, y + rowHeight / 2, { size: 17, color: foreground, align: "center", maxWidth: selectedWidth - 24 });
          return;
        }
        let x = tableX;
        selectedColumns.forEach(columnIndex => {
          const cell = cells[columnIndex];
          const cellWidth = columnWidths[columnIndex] || 120;
          context.fillStyle = background;
          context.fillRect(x, y, cellWidth, rowHeight);
          context.strokeStyle = "#d9d4c7";
          context.strokeRect(x, y, cellWidth, rowHeight);
          const isLabel = columnIndex < 2;
          drawReportText(context, cell?.textContent?.trim() || "", isLabel ? x + 10 : x + cellWidth - 9, y + rowHeight / 2, {
            size: isHeader ? 15 : 17,
            weight: isHeader || cell?.tagName === "TH" ? 900 : 500,
            color: foreground,
            align: isLabel ? "left" : "right",
            maxWidth: cellWidth - 18
          });
          x += cellWidth;
        });
      });
    });
    canvas.reportPdfSections = periodChunks.map((_, chunkIndex) => ({
      y: Math.round((startY + chunkIndex * sectionHeight) * scale),
      height: Math.round((sectionLabelHeight + rowHeight) * scale),
      end: Math.round((startY + (chunkIndex + 1) * sectionHeight) * scale)
    }));
    return canvas;
  }

  function buildReportJpgCanvas(target) {
    if (target.id === "report-trend-card") return reportTrendCanvas(target);
    if (target.id === "report-matrix-card") return reportMatrixCanvas(target);
    return reportRankedCanvas(target);
  }

  function reportMatrixPdfCanvases(target) {
    const table = target.querySelector(".report-matrix-table");
    const rows = [...table.querySelectorAll("tr")];
    const columnCount = Math.max(...rows.map(row => row.children.length), 0);
    const periodColumns = Array.from({ length: Math.max(0, columnCount - 4) }, (_, index) => index + 2);
    const summaryColumns = columnCount >= 2 ? [columnCount - 2, columnCount - 1] : [];
    const midpoint = Math.ceil(periodColumns.length / 2);
    const periodChunks = periodColumns.length > 3
      ? [periodColumns.slice(0, midpoint), periodColumns.slice(midpoint)]
      : [periodColumns];
    const pageWidth = 1240;
    const pageHeight = 1754;
    const margin = 42;
    const tableTop = 150;
    const footerHeight = 44;
    const availableWidth = pageWidth - margin * 2;
    const rowHeight = Math.max(20, Math.min(31, Math.floor((pageHeight - tableTop - footerHeight) / Math.max(1, rows.length))));
    const pages = [];

    periodChunks.forEach((periodChunk, pageIndex) => {
      const selectedColumns = [0, 1, ...periodChunk, ...summaryColumns];
      const fixedWidths = [135, 225];
      const numericWidth = (availableWidth - fixedWidths[0] - fixedWidths[1]) / Math.max(1, selectedColumns.length - 2);
      const selectedWidths = selectedColumns.map((_, index) => index === 0 ? fixedWidths[0] : index === 1 ? fixedWidths[1] : numericWidth);
      const canvas = document.createElement("canvas");
      canvas.width = pageWidth;
      canvas.height = pageHeight;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageWidth, pageHeight);

      const firstLabel = table.querySelector(`thead th:nth-child(${(periodChunk[0] ?? 2) + 1})`)?.textContent || "期間";
      const lastLabel = table.querySelector(`thead th:nth-child(${(periodChunk.at(-1) ?? 2) + 1})`)?.textContent || firstLabel;
      drawReportText(context, "初一食午｜收入與支出項目明細表", margin, 30, { size: 22, weight: 900 });
      drawReportText(context, $("#report-period-label").textContent, pageWidth - margin, 30, { size: 16, weight: 800, color: "#66746d", align: "right" });
      drawReportText(context, `明細表 ${pageIndex + 1}/${periodChunks.length}｜${firstLabel}${firstLabel === lastLabel ? "" : ` ～ ${lastLabel}`}｜右側保留期間合計與占比`, margin, 72, { size: 19, weight: 900, color: "#31536f", maxWidth: availableWidth });
      drawReportText(context, "收入與支出分類使用相同期間與資料來源；正式員工薪資統一列於每月 28 日。", margin, 108, { size: 14, color: "#66746d", maxWidth: availableWidth });
      context.strokeStyle = "#d9d4c7";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(margin, 132);
      context.lineTo(pageWidth - margin, 132);
      context.stroke();

      rows.forEach((row, rowIndex) => {
        const isHeader = row.parentElement?.tagName === "THEAD";
        const isIncomeType = row.classList.contains("report-matrix-type") && row.classList.contains("income");
        const isExpenseType = row.classList.contains("report-matrix-type") && row.classList.contains("expense");
        const isIncomeGroup = row.classList.contains("report-matrix-group") && row.classList.contains("income");
        const isExpenseGroup = row.classList.contains("report-matrix-group") && row.classList.contains("expense");
        const background = isIncomeType ? "#23684f" : isExpenseType ? "#b54e52" : isIncomeGroup ? "#e6f2eb" : isExpenseGroup ? "#fbe9e7" : isHeader ? "#f7f4ec" : rowIndex % 2 ? "#fffdf8" : "#faf9f5";
        const foreground = isIncomeType || isExpenseType ? "#ffffff" : "#17231e";
        const y = tableTop + rowIndex * rowHeight;
        const cells = Array(columnCount).fill(null);
        let logicalColumn = 0;
        [...row.children].forEach(cell => {
          const span = Math.max(1, Number(cell.colSpan || 1));
          cells[logicalColumn] = cell;
          logicalColumn += span;
        });
        if (row.children.length === 1 && Number(row.children[0].colSpan || 1) > 1) {
          context.fillStyle = background;
          context.fillRect(margin, y, availableWidth, rowHeight);
          context.strokeStyle = "#d9d4c7";
          context.strokeRect(margin, y, availableWidth, rowHeight);
          drawReportText(context, row.children[0].textContent?.trim() || "", pageWidth / 2, y + rowHeight / 2, { size: 15, color: foreground, align: "center", maxWidth: availableWidth - 24 });
          return;
        }
        let x = margin;
        selectedColumns.forEach((columnIndex, selectedIndex) => {
          const cell = cells[columnIndex];
          const cellWidth = selectedWidths[selectedIndex];
          context.fillStyle = background;
          context.fillRect(x, y, cellWidth, rowHeight);
          context.strokeStyle = "#d9d4c7";
          context.strokeRect(x, y, cellWidth, rowHeight);
          const isLabel = columnIndex < 2;
          const fontSize = isHeader ? Math.min(14, rowHeight * .5) : Math.min(periodChunk.length > 4 ? 13 : 15.5, rowHeight * .54);
          drawReportText(context, cell?.textContent?.trim() || "", isLabel ? x + 7 : x + cellWidth - 6, y + rowHeight / 2, {
            size: fontSize,
            weight: isHeader || cell?.tagName === "TH" ? 900 : 500,
            color: foreground,
            align: isLabel ? "left" : "right",
            maxWidth: cellWidth - 13
          });
          x += cellWidth;
        });
      });

      drawReportText(context, `收入與支出項目明細表｜第 ${pageIndex + 1} / ${periodChunks.length} 頁`, pageWidth / 2, pageHeight - 20, { size: 13, weight: 700, color: "#66746d", align: "center" });
      pages.push(canvas);
    });
    return pages;
  }

  function pdfAscii(value) {
    return new TextEncoder().encode(value);
  }

  function joinPdfBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    parts.forEach(part => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function splitReportCanvasForPdf(source, reportName) {
    const pageWidth = source.width;
    const pageHeight = Math.round(pageWidth * 841.89 / 595.28);
    const headerHeight = Math.round(pageWidth * .075);
    const footerHeight = Math.round(pageWidth * .05);
    const contentHeight = pageHeight - headerHeight - footerHeight;
    const repeatedHeaders = Array.isArray(source.reportPdfSections) ? source.reportPdfSections : [];
    const repeatedHeaderHeight = repeatedHeaders.length ? Math.max(...repeatedHeaders.map(item => item.height)) : 0;
    const repeatCapacity = Math.max(1, contentHeight - repeatedHeaderHeight);
    const totalPages = repeatedHeaders.length
      ? Math.max(1, 1 + Math.ceil(Math.max(0, source.height - contentHeight) / repeatCapacity))
      : Math.max(1, Math.ceil(source.height / contentHeight));
    const totalCapacity = contentHeight + Math.max(0, totalPages - 1) * repeatCapacity;
    const utilization = Math.min(1, source.height / totalCapacity);
    const pages = [];
    let sourceY = 0;
    for (let index = 0; index < totalPages; index += 1) {
      const repeatedHeader = index ? repeatedHeaders.find(item => sourceY >= item.y && sourceY < item.end) || repeatedHeaders.findLast(item => sourceY >= item.y) || repeatedHeaders[0] : null;
      const availableHeight = contentHeight - (repeatedHeader?.height || 0);
      const sliceHeight = index === totalPages - 1 ? source.height - sourceY : Math.min(source.height - sourceY, Math.max(1, Math.round(availableHeight * utilization)));
      const page = document.createElement("canvas");
      page.width = pageWidth;
      page.height = pageHeight;
      const context = page.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageWidth, pageHeight);
      context.fillStyle = "#17231e";
      context.font = `900 ${Math.round(pageWidth * .019)}px ${REPORT_JPG_FONT}`;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillText(`初一食午｜${reportName}`, Math.round(pageWidth * .035), Math.round(headerHeight * .45));
      context.fillStyle = "#66746d";
      context.font = `700 ${Math.round(pageWidth * .014)}px ${REPORT_JPG_FONT}`;
      context.textAlign = "right";
      context.fillText($("#report-period-label").textContent, Math.round(pageWidth * .965), Math.round(headerHeight * .45));
      context.strokeStyle = "#d9d4c7";
      context.lineWidth = Math.max(1, Math.round(pageWidth * .001));
      context.beginPath();
      context.moveTo(Math.round(pageWidth * .035), headerHeight - 1);
      context.lineTo(Math.round(pageWidth * .965), headerHeight - 1);
      context.stroke();
      let contentY = headerHeight;
      if (repeatedHeader) {
        context.drawImage(source, 0, repeatedHeader.y, source.width, repeatedHeader.height, 0, contentY, pageWidth, repeatedHeader.height);
        contentY += repeatedHeader.height;
      }
      context.drawImage(source, 0, sourceY, source.width, sliceHeight, 0, contentY, pageWidth, sliceHeight);
      context.fillStyle = "#66746d";
      context.font = `600 ${Math.round(pageWidth * .013)}px ${REPORT_JPG_FONT}`;
      context.textAlign = "center";
      context.fillText(`${reportName}｜第 ${index + 1} / ${totalPages} 頁`, pageWidth / 2, pageHeight - footerHeight * .45);
      pages.push(page);
      sourceY += sliceHeight;
    }
    return pages;
  }

  function buildPdfDocument(pages) {
    const objectCount = 2 + pages.length * 3;
    const objects = Array(objectCount + 1);
    const pageIds = pages.map((_, index) => 3 + index * 3);
    objects[1] = pdfAscii("<< /Type /Catalog /Pages 2 0 R >>");
    objects[2] = pdfAscii(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
    pages.forEach((page, index) => {
      const pageId = pageIds[index];
      const imageId = pageId + 1;
      const contentId = pageId + 2;
      const content = pdfAscii("q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n");
      objects[pageId] = pdfAscii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /ProcSet [/PDF /ImageC] /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      objects[imageId] = joinPdfBytes([
        pdfAscii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
        page.jpeg,
        pdfAscii("\nendstream")
      ]);
      objects[contentId] = joinPdfBytes([
        pdfAscii(`<< /Length ${content.length} >>\nstream\n`),
        content,
        pdfAscii("endstream")
      ]);
    });

    const header = joinPdfBytes([pdfAscii("%PDF-1.4\n%"), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), pdfAscii("\n")]);
    const parts = [header];
    const offsets = Array(objectCount + 1).fill(0);
    let length = header.length;
    for (let id = 1; id <= objectCount; id += 1) {
      offsets[id] = length;
      const object = joinPdfBytes([pdfAscii(`${id} 0 obj\n`), objects[id], pdfAscii("\nendobj\n")]);
      parts.push(object);
      length += object.length;
    }
    const xrefOffset = length;
    const xref = [`xref\n0 ${objectCount + 1}\n`, "0000000000 65535 f \n"];
    for (let id = 1; id <= objectCount; id += 1) xref.push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    xref.push(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    parts.push(pdfAscii(xref.join("")));
    return joinPdfBytes(parts);
  }

  async function exportFullReportPdf(button) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "產生 PDF 中…";
    try {
      const reports = [
        ["report-trend-card", "收入與支出趨勢"],
        ["report-expense-groups-card", "支出分類占比"],
        ["report-income-sources-card", "收入來源"],
        ["report-vendors-card", "廠商與支出對象占比"],
        ["report-matrix-card", "收入與支出項目明細表"]
      ];
      const pages = [];
      for (const [id, name] of reports) {
        const target = document.getElementById(id);
        const pageCanvases = id === "report-matrix-card"
          ? reportMatrixPdfCanvases(target)
          : splitReportCanvasForPdf(buildReportJpgCanvas(target), name);
        for (const pageCanvas of pageCanvases) {
          const jpeg = new Uint8Array(await (await canvasJpeg(pageCanvas)).arrayBuffer());
          pages.push({ width: pageCanvas.width, height: pageCanvas.height, jpeg });
        }
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      const periodLabel = $("#report-period-label").textContent;
      const pdf = buildPdfDocument(pages);
      downloadBlob(new Blob([pdf], { type: "application/pdf" }), safeReportFilename(`初一食午_${periodLabel}_收入支出統計報表.pdf`));
      toast(`整份 PDF 已下載，共 ${pages.length} 頁。`);
    } catch (error) {
      console.error("Unable to export report PDF", error);
      toast("PDF 產生失敗，請重新整理後再試一次。");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function exportReportJpg(button) {
    const target = document.getElementById(button.dataset.reportJpg || "");
    if (!target) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "產生中…";
    try {
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      const jpeg = await canvasJpeg(buildReportJpgCanvas(target));
      const periodLabel = $("#report-period-label").textContent;
      const reportName = button.dataset.reportJpgName || "收入支出統計報表";
      downloadBlob(jpeg, safeReportFilename(`初一食午_${periodLabel}_${reportName}.jpg`));
      toast(`${reportName} JPG 已下載。`);
    } catch (error) {
      console.error("Unable to export report JPG", error);
      toast("JPG 產生失敗，請重新整理後再試一次。");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
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
    reportAnchorDate = preferredDate.startsWith(month) ? preferredDate : `${month}-01`;
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
    $("#budget-form").addEventListener("submit", event => {
      event.preventDefault();
      if (isMonthLocked(state.selectedMonth)) {
        toast("本月已鎖定，請先解除月結後再調整預算。");
        return;
      }
      const groups = Object.fromEntries([...document.querySelectorAll("[data-budget-group]")].map(input => [input.dataset.budgetGroup, Math.max(0, Number(input.value || 0))]));
      state.budgets[state.selectedMonth] = INSIGHTS.normalizeBudget({
        targetIncome: $("#budget-target-income").value,
        targetExpense: $("#budget-target-expense").value,
        targetNet: $("#budget-target-net").value,
        groups,
        updatedAt: new Date().toISOString()
      }, GROUPS.expense);
      logAudit("更新月度預算", `${state.selectedMonth}・收入目標 ${money(state.budgets[state.selectedMonth].targetIncome)}・支出上限 ${money(state.budgets[state.selectedMonth].targetExpense)}`);
      saveState("本月預算已儲存");
      renderAll();
      toast("本月預算與成本上限已更新。");
    });
    document.querySelector(".report-grain-switch").addEventListener("click", event => {
      const button = event.target.closest("[data-report-grain]");
      if (button) setReportGrain(button.dataset.reportGrain);
    });
    $("#report-period-prev").addEventListener("click", () => shiftReportPeriod(-1));
    $("#report-period-next").addEventListener("click", () => shiftReportPeriod(1));
    $("#report-period-current").addEventListener("click", resetReportPeriod);
    $("#report-download-pdf").addEventListener("click", event => exportFullReportPdf(event.currentTarget));
    $("#report-dashboard").addEventListener("click", event => {
      const button = event.target.closest("[data-report-jpg]");
      if (button) exportReportJpg(button);
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
    window.addEventListener("offline", () => {
      if (!cloudUser || !readCloudMeta().dirty) return;
      window.clearTimeout(cloudSaveTimer);
      setCloudStatus("目前離線，本機變更會在恢復網路後自動同步", "waiting");
    });
    window.addEventListener("online", () => {
      updateCloudIndicators();
      if (!cloudUser || !readCloudMeta().dirty) return;
      if (cloudReady) syncAccountingCloud();
      else initializeAccountingCloud();
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
    $("#open-batch-income").addEventListener("click", () => {
      const today = localDateString();
      const end = today.startsWith(state.selectedMonth) ? today : `${state.selectedMonth}-${String(daysInMonth(state.selectedMonth)).padStart(2, "0")}`;
      const startDate = new Date(`${end}T12:00:00`);
      startDate.setDate(Math.max(1, startDate.getDate() - 6));
      $("#batch-income-start").value = localDateString(startDate);
      $("#batch-income-end").value = end;
      renderBatchIncomeRows();
      $("#batch-income-dialog").showModal();
    });
    $("#generate-batch-income").addEventListener("click", renderBatchIncomeRows);
    document.querySelectorAll('[data-close-dialog="batch-income-dialog"]').forEach(button => button.addEventListener("click", () => $("#batch-income-dialog").close()));
    $("#batch-income-form").addEventListener("submit", event => {
      event.preventDefault();
      const created = [];
      document.querySelectorAll("#batch-income-body tr[data-batch-date]").forEach(row => {
        const date = row.dataset.batchDate;
        if (isDateLocked(date) || state.shopClosures?.[date]?.closed) return;
        BATCH_DAILY_INCOME_ITEMS.forEach(definition => {
          const input = row.querySelector(`[data-batch-income="${definition.key}"]`);
          const amount = Number(input?.value || 0);
          if (!input || input.disabled || !(amount > 0)) return;
          const exists = state.transactions.some(item => item.date === date && item.type === "income" && canonicalIncomeItem(item.category || item.counterparty || item.group) === definition.item);
          if (exists) return;
          created.push({
            id: uid("entry"), date, type: "income", group: definition.group, category: definition.item,
            amount, paymentMethod: definition.paymentMethod, counterparty: definition.item,
            note: "固定收入批次補登", receiptDataUrl: "", source: "batch-daily-income", locked: false,
            recurringTemplateId: "", createdAt: new Date().toISOString()
          });
        });
      });
      if (!created.length) { toast("沒有可新增的金額；既有項目不會重複寫入。" ); return; }
      state.transactions.push(...created);
      pushUndo(`批次補登 ${created.length} 筆固定收入`, "batch", "remove", { ids: created.map(item => item.id) });
      logAudit("固定收入批次補登", `${created[0].date}～${created.at(-1).date}・${created.length} 筆`, created[0].date.slice(0, 7));
      state.selectedMonth = created.at(-1).date.slice(0, 7);
      selectedLedgerDate = created.at(-1).date;
      saveState(`已批次新增 ${created.length} 筆收入`);
      $("#batch-income-dialog").close();
      renderAll();
      toast(`已安全補登 ${created.length} 筆固定收入。`);
    });
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
      const duplicate = state.transactions.find(item => (
        item.date === transaction.date && item.type === transaction.type &&
        canonicalIncomeItem(item.category) === canonicalIncomeItem(transaction.category) &&
        Number(item.amount || 0) === transaction.amount &&
        String(item.counterparty || "").trim() === transaction.counterparty
      ));
      if (duplicate && !window.confirm(`發現疑似重複記帳：\n${transaction.date}・${transaction.category}・${money(transaction.amount)}\n\n仍要新增嗎？`)) return;
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

    $("#daily-income-checklist").addEventListener("click", event => {
      const button = event.target.closest("#toggle-shop-closure");
      if (!button) return;
      if (isMonthLocked(selectedLedgerDate.slice(0, 7))) { toast("本月已完成月結，無法變更店休狀態。"); return; }
      const previous = state.shopClosures[selectedLedgerDate] ? { ...state.shopClosures[selectedLedgerDate] } : null;
      const status = requiredDailyIncomeStatus(selectedLedgerDate);
      if (status.isShopClosed) {
        delete state.shopClosures[selectedLedgerDate];
        pushUndo(`取消 ${selectedLedgerDate} 店休`, "shopClosure", "restore", { date: selectedLedgerDate, previous });
        logAudit("取消店休", selectedLedgerDate, selectedLedgerDate.slice(0, 7));
        saveState("已取消店休");
        renderAll();
        toast(`${selectedLedgerDate} 已恢復固定收入檢查。`);
        return;
      }
      if (status.recorded.size && !window.confirm(`${selectedLedgerDate} 已有 ${status.recorded.size} 項固定收入記帳，仍要標記為店休嗎？`)) return;
      state.shopClosures[selectedLedgerDate] = { date: selectedLedgerDate, closed: true, markedAt: new Date().toISOString() };
      pushUndo(`標記 ${selectedLedgerDate} 店休`, "shopClosure", "restore", { date: selectedLedgerDate, previous });
      logAudit("標記店休", selectedLedgerDate, selectedLedgerDate.slice(0, 7));
      saveState("已標記店休");
      renderAll();
      toast(`${selectedLedgerDate} 已標記為店休，不再提醒固定收入。`);
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
      const requiredStatus = requiredDailyIncomeStatus(selectedLedgerDate);
      if (requiredStatus.shouldWarn) {
        toast(`尚有 ${requiredStatus.missing.length} 項固定收入未登錄，請補齊或先標記店休。`);
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

    $("#payable-form").addEventListener("submit", event => {
      event.preventDefault();
      if (isMonthLocked()) { toast("本月已鎖定，請先解除月結。" ); return; }
      const payable = {
        id: uid("payable"), vendor: $("#payable-vendor").value.trim(), amount: Number($("#payable-amount").value || 0),
        dueDate: $("#payable-due-date").value, group: $("#payable-group").value,
        category: $("#payable-category").value.trim(), note: $("#payable-note").value.trim(),
        status: "open", createdAt: new Date().toISOString()
      };
      if (!payable.vendor || !payable.dueDate || !payable.category || !(payable.amount > 0)) return;
      state.payables.push(payable);
      logAudit("新增應付帳款", `${payable.vendor}・${money(payable.amount)}・期限 ${payable.dueDate}`, payable.dueDate.slice(0, 7));
      event.target.reset();
      setFormDates();
      saveState("應付帳款已新增");
      renderAll();
      toast("應付帳款已加入提醒。" );
    });
    $("#payable-list").addEventListener("click", event => {
      const payButton = event.target.closest(".pay-payable");
      const deleteButton = event.target.closest(".delete-payable");
      const id = payButton?.dataset.id || deleteButton?.dataset.id;
      const payable = state.payables.find(item => item.id === id);
      if (!payable) return;
      if (deleteButton) {
        if (!window.confirm(`確定刪除「${payable.vendor}」${money(payable.amount)} 的待付款提醒？`)) return;
        state.payables = state.payables.filter(item => item.id !== id);
        logAudit("刪除應付帳款", `${payable.vendor}・${money(payable.amount)}`);
        saveState("應付帳款已刪除");
        renderAll();
        return;
      }
      const paidDate = localDateString();
      if (!requireUnlockedDate(paidDate, "付款入帳")) return;
      if (!window.confirm(`確認已支付 ${payable.vendor} ${money(payable.amount)}，並新增為 ${paidDate} 支出？`)) return;
      const transaction = {
        id: uid("entry"), date: paidDate, type: "expense", group: payable.group || "其他支出", category: payable.category,
        amount: Number(payable.amount || 0), paymentMethod: "銀行轉帳", counterparty: payable.vendor,
        note: [payable.note, `應付帳款付款・原期限 ${payable.dueDate}`].filter(Boolean).join("・"), receiptDataUrl: "",
        source: "payable", payableId: payable.id, locked: false, recurringTemplateId: "", createdAt: new Date().toISOString()
      };
      state.transactions.push(transaction);
      payable.status = "paid";
      payable.paidDate = paidDate;
      payable.transactionId = transaction.id;
      payable.paidAt = new Date().toISOString();
      logAudit("應付帳款付款入帳", `${payable.vendor}・${money(payable.amount)}`, paidDate.slice(0, 7));
      saveState("付款已入帳");
      renderAll();
      toast("付款完成，已同步新增正式支出。" );
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
    const hashTarget = window.location.hash.slice(1);
    const hashPage = ({ today: "ledger", ledger: "ledger", budget: "ledger", catalog: "catalog", safety: "safety" })[hashTarget];
    const initialPage = hashPage || (ACCOUNTING_PAGES[requestedPage] ? requestedPage : ACCOUNTING_PAGES[savedPage] ? savedPage : "entry");
    const requestedMonth = params.get("month");
    const sharedMonth = window.BreakfastOperationsStore?.getGlobalMonth("");
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth || "")) state.selectedMonth = requestedMonth;
    else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(sharedMonth || "")) state.selectedMonth = sharedMonth;
    reportAnchorDate = `${state.selectedMonth}-01`;
    renderMonthOptions();
    const requestedDate = params.get("date");
    if (requestedDate?.startsWith(state.selectedMonth)) selectedLedgerDate = requestedDate;
    else if (hashTarget === "today" && localDateString().startsWith(state.selectedMonth)) selectedLedgerDate = localDateString();
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
    if (hashTarget === "budget") window.requestAnimationFrame(() => document.querySelector("#budget")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    window.addEventListener("hashchange", () => {
      const target = window.location.hash.slice(1);
      const page = ({ today: "ledger", ledger: "ledger", budget: "ledger", catalog: "catalog", safety: "safety" })[target];
      if (!page) return;
      if (target === "today" && localDateString().startsWith(state.selectedMonth)) selectedLedgerDate = localDateString();
      setAccountingPage(page, { updateUrl: false });
      renderAll();
      if (target === "budget") window.requestAnimationFrame(() => document.querySelector("#budget")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    });
    window.BreakfastOperationsStore?.autoSnapshot("accounting", state, {
      label: "記帳每日自動快照",
      summary: { month: state.selectedMonth, transactions: state.transactions.length, labor: state.dayLabor.length }
    }).then(() => renderSnapshotList());
    initializeAccountingCloud();
    updateCloudIndicators();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
