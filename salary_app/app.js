(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-payroll-v1";
  const AI_TOKEN_STORAGE_KEY = "breakfast-payroll-ai-token";
  const CLOUD_LOCAL_BACKUP_KEY = "breakfast-payroll-before-cloud";
  const CLOUD_SAVE_DELAY = 900;
  const APP_VERSION = 3;
  const BUNDLED_HISTORY = window.BREAKFAST_SALARY_HISTORY_2026_H1 || null;
  const BUNDLED_HISTORY_ID = BUNDLED_HISTORY?.id || "";
  const MINIMUM_HOURLY_WAGE_2026 = 196;
  const MINIMUM_MONTHLY_WAGE_2026 = 29500;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const OFFICIAL_DAYS_2026 = [
    ["2026-01-01", "元旦"],
    ["2026-02-15", "小年夜"],
    ["2026-02-16", "除夕"],
    ["2026-02-17", "春節初一"],
    ["2026-02-18", "春節初二"],
    ["2026-02-19", "春節初三"],
    ["2026-02-20", "春節補假"],
    ["2026-02-27", "和平紀念日補假"],
    ["2026-02-28", "和平紀念日"],
    ["2026-04-03", "兒童節補假"],
    ["2026-04-04", "兒童節"],
    ["2026-04-05", "清明節"],
    ["2026-04-06", "清明節補假"],
    ["2026-05-01", "勞動節"],
    ["2026-06-19", "端午節"],
    ["2026-09-25", "中秋節"],
    ["2026-09-28", "教師節"],
    ["2026-10-09", "國慶日補假"],
    ["2026-10-10", "國慶日"],
    ["2026-10-25", "臺灣光復紀念日"],
    ["2026-10-26", "臺灣光復紀念日補假"],
    ["2026-12-25", "行憲紀念日"]
  ].map(([date, label]) => ({ id: `official-${date}`, date, label, type: "national", official: true }));

  function createDefaultState() {
    return {
      version: APP_VERSION,
      settings: {
        month: "2026-07",
        nationalMultiplier: 2,
        typhoonMultiplier: 1.5,
        roundingMode: "final",
        monthlyRestQuota: 7,
        sickPayRatio: 0.5,
        ruleYear: 2026,
        minimumHourlyWage: MINIMUM_HOURLY_WAGE_2026,
        minimumMonthlyWage: MINIMUM_MONTHLY_WAGE_2026,
        shareExpiryDays: 7,
        monthlySales: {},
        accessRoles: {},
        importedSources: {}
      },
      employees: [
        { id: "shangqi", name: "上齊", payType: "hourly", hourlyRate: 200, weekendRate: 200, holidayRate: 200, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "lin-chen", name: "林辰亘", payType: "hourly", hourlyRate: 230, weekendRate: 240, holidayRate: 230, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "huang", name: "黃采葳", payType: "hourly", hourlyRate: 220, weekendRate: 220, holidayRate: 220, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "lin-jun", name: "林筠翔", payType: "hourly", hourlyRate: 200, weekendRate: 200, holidayRate: 200, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "he", name: "何秀芷", payType: "monthly", hourlyRate: 0, weekendRate: 0, holidayRate: 0, monthlySalary: 41000, scheduleStart: "08:00", scheduleEnd: "15:00", hireDate: "", annualLeave: 4, active: true },
        { id: "kai", name: "愷葶", payType: "hourly", hourlyRate: 200, weekendRate: 200, holidayRate: 200, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "bofan", name: "柏帆", payType: "hourly", hourlyRate: 210, weekendRate: 210, holidayRate: 210, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "yixin", name: "以馨", payType: "monthly", hourlyRate: 0, weekendRate: 0, holidayRate: 0, monthlySalary: 50000, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "yuexia", name: "月霞", payType: "monthly", hourlyRate: 0, weekendRate: 0, holidayRate: 0, monthlySalary: 40000, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: true },
        { id: "jiayi", name: "嘉怡", payType: "hourly", hourlyRate: 210, weekendRate: 210, holidayRate: 210, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: false },
        { id: "jialong", name: "佳龍", payType: "hourly", hourlyRate: 200, weekendRate: 200, holidayRate: 200, monthlySalary: 0, scheduleStart: "", scheduleEnd: "", hireDate: "", annualLeave: 0, active: false }
      ],
      attendance: {},
      leaveRecords: {},
      adjustments: [
        { id: "adj-lin-senior-bakery", employeeId: "lin-chen", name: "資深麵包台獎金", amount: 3000, type: "earning", category: "bonus", recurring: true, month: "" },
        { id: "adj-lin-base", employeeId: "lin-chen", name: "底薪加給", amount: 1000, type: "earning", category: "allowance", recurring: true, month: "" },
        { id: "adj-huang-senior", employeeId: "huang", name: "資深員工獎金", amount: 2000, type: "earning", category: "bonus", recurring: true, month: "" },
        { id: "adj-jun-kitchen", employeeId: "lin-jun", name: "內場工作加給", amount: 2000, type: "earning", category: "allowance", recurring: true, month: "" },
        { id: "adj-jun-base", employeeId: "lin-jun", name: "底薪加給", amount: 1000, type: "earning", category: "allowance", recurring: true, month: "" },
        { id: "adj-he-insurance", employeeId: "he", name: "勞保／健保員工自負額", amount: 872, type: "deduction", category: "deduction", recurring: true, month: "" }
      ],
      specialDays: OFFICIAL_DAYS_2026,
      closedMonths: {},
      auditLog: [],
      leaveLedger: [],
      shiftOverrides: {},
      employeeShares: []
    };
  }

  function normalizeEmployee(employee) {
    const base = {
      ...employee,
      expectedWorkdays: Array.isArray(employee?.expectedWorkdays) ? employee.expectedWorkdays.map(Number) : [],
      punchPinHash: employee?.punchPinHash || "",
      peakRate: Number(employee?.peakRate || 0),
      peakStart: employee?.peakStart || "",
      peakEnd: employee?.peakEnd || ""
    };
    const legacyProfile = {
      id: `rate-${employee.id}-legacy`,
      effectiveFrom: employee.hireDate || "2000-01-01",
      payType: employee.payType || "hourly",
      hourlyRate: Number(employee.hourlyRate || 0),
      weekendRate: Number(employee.weekendRate || employee.hourlyRate || 0),
      holidayRate: Number(employee.holidayRate || employee.hourlyRate || 0),
      monthlySalary: Number(employee.monthlySalary || 0),
      scheduleStart: employee.scheduleStart || "",
      scheduleEnd: employee.scheduleEnd || "",
      expectedWorkdays: base.expectedWorkdays,
      weeklySchedule: employee.weeklySchedule || {},
      peakRate: base.peakRate,
      peakStart: base.peakStart,
      peakEnd: base.peakEnd
    };
    const history = Array.isArray(employee?.payHistory) && employee.payHistory.length
      ? employee.payHistory
      : [legacyProfile];
    return {
      ...base,
      payHistory: history
        .map((profile, index) => ({
          ...legacyProfile,
          ...profile,
          id: profile.id || `rate-${employee.id}-${index}`,
          effectiveFrom: profile.effectiveFrom || legacyProfile.effectiveFrom,
          expectedWorkdays: Array.isArray(profile.expectedWorkdays)
            ? profile.expectedWorkdays.map(Number)
            : legacyProfile.expectedWorkdays,
          weeklySchedule: profile.weeklySchedule && typeof profile.weeklySchedule === "object"
            ? profile.weeklySchedule
            : legacyProfile.weeklySchedule
        }))
        .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    };
  }

  function normalizeAdjustment(adjustment) {
    const currentMonth = adjustment.month || "";
    return {
      ...adjustment,
      quantity: Number(adjustment.quantity || 1),
      unitRate: Number(adjustment.unitRate || adjustment.amount || 0),
      effectiveFrom: adjustment.effectiveFrom || (adjustment.recurring ? "2000-01" : currentMonth),
      effectiveTo: adjustment.effectiveTo || (adjustment.recurring ? "" : currentMonth)
    };
  }

  function importedProfileForMonth(employee, month) {
    const target = `${month}-31`;
    return (employee.payHistory || [])
      .filter(profile => !profile.effectiveFrom || profile.effectiveFrom <= target)
      .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
      .at(-1) || employee;
  }

  function applyBundledHistory(normalized) {
    if (!BUNDLED_HISTORY_ID || normalized.settings.importedSources?.[BUNDLED_HISTORY_ID]) {
      return normalized;
    }

    const employeeByName = new Map(normalized.employees.map(employee => [employee.name, employee]));
    (BUNDLED_HISTORY.employees || []).forEach(definition => {
      const {
        name,
        id,
        effectiveFrom,
        hireDate = "",
        endDate = "",
        active,
        ...rateFields
      } = definition;
      let employee = employeeByName.get(name);
      const profile = {
        id: `imported-rate-${id}-${effectiveFrom}`,
        effectiveFrom,
        ...rateFields,
        expectedWorkdays: [],
        weeklySchedule: {}
      };
      if (!employee) {
        employee = normalizeEmployee({
          id,
          name,
          hireDate,
          endDate,
          annualLeave: 0,
          active: active ?? true,
          ...rateFields,
          payHistory: [profile]
        });
        normalized.employees.push(employee);
        employeeByName.set(name, employee);
      } else {
        if (hireDate && !employee.hireDate) employee.hireDate = hireDate;
        if (endDate && !employee.endDate) employee.endDate = endDate;
        if (typeof active === "boolean" && !employee.active) employee.active = active;
        if (!(employee.payHistory || []).some(item => item.effectiveFrom === effectiveFrom)) {
          employee.payHistory = [...(employee.payHistory || []), profile]
            .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)));
        }
      }
    });

    (BUNDLED_HISTORY.attendance || []).forEach(sourceRecord => {
      const employee = employeeByName.get(sourceRecord.employeeName);
      if (!employee) return;
      const key = `${employee.id}|${sourceRecord.date}`;
      if (normalized.attendance[key] || normalized.leaveRecords[key]) return;
      normalized.attendance[key] = {
        employeeId: employee.id,
        date: sourceRecord.date,
        segments: sourceRecord.segments,
        status: "confirmed",
        source: `匯入：${BUNDLED_HISTORY.source}`,
        confidence: 100,
        note: `原工資簿 ${sourceRecord.sourceMinutes} 分鐘・${sourceRecord.sourceCells}`
      };
    });

    Object.entries(BUNDLED_HISTORY.payroll || {}).forEach(([month, sourceRows]) => {
      if (normalized.closedMonths[month]?.snapshot) return;
      const rows = sourceRows.map(sourceRow => {
        const employee = employeeByName.get(sourceRow.employeeName);
        if (!employee) return null;
        const profile = importedProfileForMonth(employee, month);
        const snapshotEmployee = {
          ...employee,
          ...profile,
          id: employee.id,
          name: employee.name
        };
        const adjustments = (sourceRow.adjustments || []).map((adjustment, index) => ({
          id: `imported-${month}-${employee.id}-${index}`,
          employeeId: employee.id,
          name: adjustment.name,
          amount: adjustment.amount,
          quantity: 1,
          unitRate: adjustment.amount,
          type: adjustment.type,
          category: adjustment.category,
          recurring: false,
          month,
          effectiveFrom: month,
          effectiveTo: month
        }));
        return {
          ...sourceRow,
          employee: snapshotEmployee,
          adjustments,
          leaves: [],
          leaveSummary: {
            restDays: 0,
            recordedAnnualDays: 0,
            convertedAnnualDays: 0,
            ledgerAdjustment: 0,
            entitlement: Number(employee.annualLeave || 0),
            annualUsed: 0,
            annualRemaining: Number(employee.annualLeave || 0)
          }
        };
      }).filter(Boolean);
      normalized.closedMonths[month] = {
        ...(normalized.closedMonths[month] || {}),
        locked: true,
        workflowStatus: "paid",
        lockedAt: `${month}-28T12:00:00.000+08:00`,
        paidAt: `${month}-28T12:00:00.000+08:00`,
        paidBy: "2026 工資簿匯入",
        importedSource: BUNDLED_HISTORY_ID,
        snapshot: {
          createdAt: `${month}-28T12:00:00.000+08:00`,
          source: BUNDLED_HISTORY.source,
          rows
        }
      };
    });

    normalized.settings.importedSources = {
      ...(normalized.settings.importedSources || {}),
      [BUNDLED_HISTORY_ID]: {
        source: BUNDLED_HISTORY.source,
        months: BUNDLED_HISTORY.sourceMonths,
        importedAt: "2026-07-31"
      }
    };
    normalized.auditLog = [
      {
        id: `import-${BUNDLED_HISTORY_ID}`,
        month: "2026-06",
        action: "匯入 2026 年 1～6 月工資簿",
        detail: "已匯入每日出勤、費率、薪資總額與加扣款；歷史月份以工資簿快照鎖定。",
        actor: "系統資料移轉",
        timestamp: "2026-07-31T12:00:00.000+08:00"
      },
      ...(normalized.auditLog || [])
    ];
    return normalized;
  }

  function normalizeState(saved) {
    const defaults = createDefaultState();
    const normalized = {
      ...defaults,
      ...(saved || {}),
      version: APP_VERSION,
      settings: {
        ...defaults.settings,
        ...(saved?.settings || {}),
        monthlySales: { ...defaults.settings.monthlySales, ...(saved?.settings?.monthlySales || {}) },
        accessRoles: { ...defaults.settings.accessRoles, ...(saved?.settings?.accessRoles || {}) },
        importedSources: { ...defaults.settings.importedSources, ...(saved?.settings?.importedSources || {}) }
      },
      employees: (Array.isArray(saved?.employees) ? saved.employees : defaults.employees).map(normalizeEmployee),
      attendance: saved?.attendance || {},
      leaveRecords: saved?.leaveRecords || {},
      adjustments: (Array.isArray(saved?.adjustments) ? saved.adjustments : defaults.adjustments).map(normalizeAdjustment),
      specialDays: Array.isArray(saved?.specialDays) ? saved.specialDays : defaults.specialDays,
      closedMonths: saved?.closedMonths || {},
      auditLog: Array.isArray(saved?.auditLog) ? saved.auditLog : [],
      leaveLedger: Array.isArray(saved?.leaveLedger) ? saved.leaveLedger : [],
      shiftOverrides: saved?.shiftOverrides || {},
      employeeShares: Array.isArray(saved?.employeeShares) ? saved.employeeShares : []
    };
    return applyBundledHistory(normalized);
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const normalized = normalizeState(raw ? JSON.parse(raw) : createDefaultState());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    } catch (error) {
      console.warn("Unable to load saved payroll data", error);
      return normalizeState(createDefaultState());
    }
  }

  let state = loadState();
  let runtimeUploads = [];
  let ocrWorker = null;
  let ocrPhase = { label: "", start: 0, span: 100 };
  let toastTimer = null;
  let attendanceDialogEmployeeId = "";
  let attendanceDialogOriginalDate = "";
  let saveAndAdvanceAttendance = false;
  let ocrReviewUploadId = "";
  let cloudUser = null;
  let cloudRevision = "";
  let cloudReady = false;
  let cloudSaving = false;
  let cloudSavePending = false;
  let cloudSaveTimer = null;
  let cloudCallbackMode = "";
  let cloudCallbackToken = "";
  let pendingAuditEvents = [];
  let currentPayslipEmployeeId = "";

  function saveState(message = "已儲存於本機") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const indicator = $("#save-state");
    if (indicator) {
      indicator.textContent = message;
      window.setTimeout(() => { indicator.textContent = "已儲存於本機"; }, 1200);
    }
    scheduleCloudSave();
  }

  function uid(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function adjustmentCategory(adjustment) {
    if (["bonus", "gift", "allowance", "deduction"].includes(adjustment?.category)) {
      return adjustment.category;
    }
    if (adjustment?.type === "deduction") return "deduction";
    const name = String(adjustment?.name || "");
    if (name.includes("禮金")) return "gift";
    if (name.includes("獎金")) return "bonus";
    return "allowance";
  }

  function adjustmentCategoryLabel(adjustment) {
    return {
      bonus: "獎金",
      gift: "禮金",
      allowance: "其他加給",
      deduction: "扣款"
    }[adjustmentCategory(adjustment)];
  }

  function currentUserRole() {
    if (!cloudUser) return "owner";
    const email = String(cloudUser.email || "").toLowerCase();
    const roles = state.settings.accessRoles || {};
    if (!Object.keys(roles).length) return "owner";
    return roles[email] || "viewer";
  }

  function roleLabel(role = currentUserRole()) {
    return {
      owner: "店主",
      payroll: "薪資管理者",
      manager: "現場主管",
      viewer: "唯讀會計"
    }[role] || "唯讀";
  }

  function hasPermission(scope) {
    const role = currentUserRole();
    const permissions = {
      owner: ["attendance", "payroll", "approve", "roles", "backup"],
      payroll: ["attendance", "payroll", "approve"],
      manager: ["attendance"],
      viewer: []
    };
    return permissions[role]?.includes(scope) || false;
  }

  function requirePermission(scope) {
    if (hasPermission(scope)) return true;
    toast(`目前帳號是「${roleLabel()}」，沒有這項操作權限。`);
    return false;
  }

  function payProfileAt(employee, dateOrMonth) {
    const target = /^\d{4}-\d{2}$/.test(dateOrMonth)
      ? `${dateOrMonth}-31`
      : dateOrMonth;
    const history = Array.isArray(employee.payHistory) ? employee.payHistory : [];
    const profile = history
      .filter(item => !item.effectiveFrom || item.effectiveFrom <= target)
      .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
      .at(-1);
    return profile || employee;
  }

  function employeeAt(employee, dateOrMonth) {
    return { ...employee, ...payProfileAt(employee, dateOrMonth), id: employee.id, name: employee.name };
  }

  function adjustmentAmount(adjustment) {
    const quantity = Number(adjustment.quantity || 1);
    const unitRate = Number(adjustment.unitRate || adjustment.amount || 0);
    return quantity * unitRate;
  }

  function adjustmentApplies(adjustment, month) {
    const from = adjustment.effectiveFrom || adjustment.month || "0000-01";
    const to = adjustment.effectiveTo || (adjustment.recurring ? "9999-12" : adjustment.month || month);
    return month >= from && month <= to;
  }

  function scheduleForDate(employee, date) {
    const override = state.shiftOverrides?.[attendanceKey(employee.id, date)];
    if (override) return override;
    const profile = payProfileAt(employee, date);
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const weekly = profile.weeklySchedule?.[weekday] || profile.weeklySchedule?.[String(weekday)];
    const expected = weekly
      ? weekly.expected !== false
      : Array.isArray(profile.expectedWorkdays) && profile.expectedWorkdays.includes(weekday);
    return {
      expected,
      start: weekly?.start || profile.scheduleStart || "",
      end: weekly?.end || profile.scheduleEnd || ""
    };
  }

  async function hashPunchPin(employeeId, pin) {
    const bytes = new TextEncoder().encode(`breakfast-punch:${employeeId}:${pin}`);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  function setCloudStatus(label, tone = "local", detail = "") {
    const topStatus = $("#cloud-sync-status");
    const panelStatus = $("#cloud-panel-status");
    const panelDetail = $("#cloud-panel-detail");
    [topStatus, panelStatus].forEach(element => {
      if (!element) return;
      element.className = `cloud-sync-status is-${tone}`;
      const text = element.querySelector("span");
      if (text) text.textContent = label;
    });
    if (panelDetail) panelDetail.textContent = detail;
  }

  function updateCloudUi() {
    const accountButton = $("#cloud-auth-button");
    const accountEmail = $("#cloud-account-email");
    const cloudActions = $("#cloud-account-actions");
    const localBackupButton = $("#cloud-download-local-backup");
    const roleElement = $("#cloud-account-role");
    const panelLogin = $("#cloud-panel-login");
    const sidebarNote = $(".sidebar-note");
    const aiAccessField = $(".ai-access-field");
    const forceUploadButton = $("#cloud-upload-current");
    if (accountButton) {
      accountButton.textContent = cloudUser ? "雲端同步設定" : "管理者登入";
      accountButton.classList.toggle("is-connected", Boolean(cloudUser));
    }
    if (accountEmail) accountEmail.textContent = cloudUser?.email || "尚未登入";
    if (roleElement) roleElement.textContent = cloudUser ? roleLabel() : "—";
    if (cloudActions) cloudActions.hidden = !cloudUser;
    if (panelLogin) panelLogin.hidden = Boolean(cloudUser);
    if (aiAccessField) aiAccessField.hidden = Boolean(cloudUser);
    if (forceUploadButton) forceUploadButton.hidden = Boolean(cloudUser) && !hasPermission("roles");
    if (sidebarNote) {
      sidebarNote.innerHTML = cloudUser
        ? `<strong>雲端同步已啟用</strong><p>${escapeHtml(cloudUser.email || "")}・${escapeHtml(roleLabel())}</p>`
        : "<strong>資料留在此裝置</strong><p>登入管理者帳號後即可安全同步。</p>";
    }
    if (localBackupButton) {
      localBackupButton.disabled = !localStorage.getItem(CLOUD_LOCAL_BACKUP_KEY);
      localBackupButton.title = localBackupButton.disabled ? "目前沒有同步前備份" : "";
    }
    if (!cloudUser) {
      setCloudStatus("僅存此裝置", "local", "登入後才會將薪資資料同步到網站。");
    }
  }

  function cloudErrorMessage(error) {
    if (error?.name === "MissingIdentityError") {
      return "Netlify 尚未啟用管理者登入功能。";
    }
    if (Number(error?.status) === 401) return "Email 或密碼不正確。";
    if (Number(error?.status) === 403) return "此帳號沒有登入權限。";
    return error instanceof Error ? error.message : "雲端服務暫時無法使用。";
  }

  async function cloudRequest(method, body) {
    const response = await fetch("/api/payroll-state", {
      method,
      credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "雲端資料讀寫失敗。");
      error.status = response.status;
      error.code = payload.error || "";
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function scheduleCloudSave() {
    if (!cloudUser || !cloudReady) return;
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => {
      pushCloudState().catch(error => console.warn("Cloud save failed", error));
    }, CLOUD_SAVE_DELAY);
  }

  async function pushCloudState({ force = false, notify = false } = {}) {
    if (!cloudUser || (!cloudReady && !force)) return;
    if (cloudSaving) {
      cloudSavePending = true;
      return;
    }
    cloudSaving = true;
    const auditBatch = pendingAuditEvents.slice();
    setCloudStatus("正在同步…", "syncing", `由 ${cloudUser.email || "管理者"} 寫入雲端。`);
    try {
      const result = await cloudRequest("PUT", {
        state,
        baseRevision: cloudRevision,
        force,
        auditEvents: auditBatch
      });
      if (auditBatch.length) {
        const sentIds = new Set(auditBatch.map(entry => entry.id));
        pendingAuditEvents = pendingAuditEvents.filter(entry => !sentIds.has(entry.id));
      }
      cloudRevision = result.revision || "";
      cloudReady = true;
      setCloudStatus(
        "已同步雲端",
        "ready",
        `${result.updatedBy || cloudUser.email || "管理者"}・${new Date(result.updatedAt || Date.now()).toLocaleString("zh-TW")}`
      );
      if (notify) toast("目前資料已安全上傳到雲端。");
    } catch (error) {
      if (error.code === "REVISION_CONFLICT") {
        cloudReady = false;
        cloudRevision = error.payload?.revision || cloudRevision;
        setCloudStatus(
          "發現雲端新版",
          "conflict",
          "另一台裝置已更新資料。請選擇下載雲端版本，或確認後以本機版本覆蓋。"
        );
        toast("雲端已有較新資料，已停止自動覆蓋。");
        showView("settings");
      } else if (error.status === 401) {
        cloudUser = null;
        cloudReady = false;
        updateCloudUi();
        toast("登入已過期，請重新登入。");
      } else {
        setCloudStatus("同步失敗", "error", cloudErrorMessage(error));
        if (notify) toast(cloudErrorMessage(error));
      }
      throw error;
    } finally {
      cloudSaving = false;
      if (cloudSavePending && cloudReady) {
        cloudSavePending = false;
        scheduleCloudSave();
      }
    }
  }

  async function pullCloudState({ notify = false } = {}) {
    if (!cloudUser) return;
    window.clearTimeout(cloudSaveTimer);
    cloudReady = false;
    setCloudStatus("正在下載…", "syncing", "正在讀取網站上的最新薪資資料。");
    try {
      const result = await cloudRequest("GET");
      if (!result.state) {
        cloudRevision = "";
        cloudReady = true;
        await pushCloudState({ notify: true });
        return;
      }
      const needsBundledHistoryMigration = Boolean(
        BUNDLED_HISTORY_ID &&
        !result.state?.settings?.importedSources?.[BUNDLED_HISTORY_ID]
      );
      const normalized = normalizeState(result.state);
      normalized.settings.month = state.settings.month;
      if (Array.isArray(result.auditLog)) {
        const migrationEntries = needsBundledHistoryMigration
          ? normalized.auditLog.filter(entry => entry.id === `import-${BUNDLED_HISTORY_ID}`)
          : [];
        normalized.auditLog = [...migrationEntries, ...result.auditLog];
      }
      const currentText = JSON.stringify(state);
      const cloudText = JSON.stringify(normalized);
      if (currentText !== cloudText) {
        localStorage.setItem(CLOUD_LOCAL_BACKUP_KEY, currentText);
      }
      state = normalized;
      if (needsBundledHistoryMigration) {
        const migrationEntry = state.auditLog.find(entry => entry.id === `import-${BUNDLED_HISTORY_ID}`);
        if (migrationEntry && !pendingAuditEvents.some(entry => entry.id === migrationEntry.id)) {
          pendingAuditEvents.push(migrationEntry);
        }
      }
      cloudRevision = result.revision || "";
      cloudReady = true;
      localStorage.setItem(STORAGE_KEY, cloudText);
      renderAll();
      updateCloudUi();
      setCloudStatus(
        "已同步雲端",
        "ready",
        `${result.updatedBy || "管理者"}・${result.updatedAt ? new Date(result.updatedAt).toLocaleString("zh-TW") : "已載入"}`
      );
      if (needsBundledHistoryMigration && hasPermission("payroll")) {
        scheduleCloudSave();
      }
      if (notify) toast("已下載雲端最新資料；原本本機內容已保留備份。");
    } catch (error) {
      cloudReady = false;
      if (error.status === 401) {
        cloudUser = null;
        cloudRevision = "";
        updateCloudUi();
      }
      setCloudStatus("無法讀取雲端", "error", cloudErrorMessage(error));
      if (notify) toast(cloudErrorMessage(error));
      throw error;
    }
  }

  async function connectCloudUser(user) {
    if (!user) return;
    cloudUser = user;
    const email = String(user.email || "").toLowerCase();
    if (email && !Object.keys(state.settings.accessRoles || {}).length) {
      state.settings.accessRoles = { [email]: "owner" };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    updateCloudUi();
    await pullCloudState().catch(error => console.warn("Cloud initialization failed", error));
  }

  async function initializeCloudIdentity() {
    const identity = window.PayrollIdentity;
    if (!identity) {
      setCloudStatus("登入元件未載入", "error", "請重新整理網頁後再試。");
      return;
    }
    try {
      const callback = await identity.handleAuthCallback();
      if (callback?.type === "invite" && callback.token) {
        cloudCallbackMode = "invite";
        cloudCallbackToken = callback.token;
        $("#cloud-password-title").textContent = "設定管理者密碼";
        $("#cloud-password-description").textContent = "請設定至少 10 個字元的密碼，完成初一食午管理者帳號啟用。";
        $("#cloud-password-dialog").showModal();
        return;
      }
      if (callback?.type === "recovery") {
        cloudCallbackMode = "recovery";
        cloudUser = callback.user;
        updateCloudUi();
        $("#cloud-password-title").textContent = "設定新密碼";
        $("#cloud-password-description").textContent = "請輸入至少 10 個字元的新密碼。";
        $("#cloud-password-dialog").showModal();
        return;
      }
      const user = callback?.user || await identity.getUser();
      if (user) await connectCloudUser(user);
      else updateCloudUi();
    } catch (error) {
      updateCloudUi();
      setCloudStatus("登入尚未設定", "error", cloudErrorMessage(error));
    }
  }

  function isMonthLocked(month = state.settings.month) {
    return Boolean(state.closedMonths?.[month]?.locked);
  }

  function logAudit(action, detail = "", month = state.settings.month) {
    const entry = {
      id: uid("audit"),
      month,
      action,
      detail,
      actor: cloudUser?.email || "本機使用者",
      timestamp: new Date().toISOString()
    };
    state.auditLog.unshift(entry);
    pendingAuditEvents.push(entry);
    state.auditLog = state.auditLog.slice(0, 250);
  }

  function requireUnlockedMonth(month = state.settings.month) {
    if (!isMonthLocked(month)) return true;
    toast(`${monthLabel(month)}已鎖定，請先解除鎖定再修改。`);
    return false;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  function money(value, digits = 0) {
    const amount = Number(value) || 0;
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: digits,
      minimumFractionDigits: digits
    }).format(amount).replace("NT$", "NT$ ");
  }

  function decimal(value, digits = 2) {
    return new Intl.NumberFormat("zh-TW", {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function monthLabel(month) {
    if (!month || !month.includes("-")) return month;
    const [year, m] = month.split("-");
    return `${year} 年 ${Number(m)} 月`;
  }

  function daysInMonth(month) {
    const [year, m] = month.split("-").map(Number);
    return new Date(year, m, 0).getDate();
  }

  function dateRangeForMonth(month) {
    return Array.from({ length: daysInMonth(month) }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  }

  function weekdayLabel(dateString) {
    return ["日", "一", "二", "三", "四", "五", "六"][new Date(`${dateString}T12:00:00`).getDay()];
  }

  function isWeekend(dateString) {
    const day = new Date(`${dateString}T12:00:00`).getDay();
    return day === 0 || day === 6;
  }

  function getEmployee(id) {
    return state.employees.find(employee => employee.id === id);
  }

  function attendanceKey(employeeId, date) {
    return `${employeeId}|${date}`;
  }

  function timeToMinutes(value) {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hour, minute] = value.split(":").map(Number);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function segmentMinutes(segment) {
    const start = timeToMinutes(segment.start);
    const end = timeToMinutes(segment.end);
    if (start === null || end === null) return 0;
    return end >= start ? end - start : (24 * 60 - start) + end;
  }

  function recordMinutes(record) {
    return (record?.segments || []).reduce((sum, segment) => sum + segmentMinutes(segment), 0);
  }

  function getDayInfo(date) {
    const matches = state.specialDays.filter(day => day.date === date);
    const national = matches.find(day => day.type === "national");
    const typhoon = matches.find(day => day.type === "typhoon");
    if (national) return { type: "national", label: national.label, matches };
    if (typhoon) return { type: "typhoon", label: typhoon.label, matches };
    if (isWeekend(date)) return { type: "weekend", label: "週末", matches };
    return { type: "weekday", label: "平日", matches };
  }

  function statusLabel(status) {
    return {
      confirmed: "已確認",
      review: "待確認",
      unreadable: "無法判斷"
    }[status] || "無紀錄";
  }

  function leaveLabel(type) {
    return {
      monthly_rest: "月休",
      annual_leave: "年假",
      unpaid: "事假／無薪假",
      sick: "病假",
      other: "其他"
    }[type] || "—";
  }

  function formatSegments(segments) {
    if (!segments?.length) return '<span class="muted-text">—</span>';
    return `<div class="time-segments">${segments.map(segment =>
      `<span class="time-chip">${escapeHtml(segment.start || "??:??")}－${escapeHtml(segment.end || "??:??")}</span>`
    ).join("")}</div>`;
  }

  function minutesAsClock(minutes) {
    const value = Math.max(0, Number(minutes) || 0);
    return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, "0")}`;
  }

  function statementTimes(record) {
    const segments = record?.segments || [];
    if (!segments.length) return { start: "—", end: "—" };
    return {
      start: segments.map(segment => segment.start || "??:??").join("／"),
      end: segments.map(segment => segment.end || "??:??").join("／")
    };
  }

  function dailyStatementPay(employee, record) {
    if (!record || record.status !== "confirmed") return 0;
    employee = employeeAt(employee, record.date);
    const minutes = recordMinutes(record);
    if (!minutes) return 0;
    const day = getDayInfo(record.date);

    if (employee.payType === "hourly") {
      const calculation = hourlyRecordCalculation(employee, record, day);
      let multiplier = 1;
      if (day.type === "national") multiplier = Number(state.settings.nationalMultiplier) || 1;
      if (day.type === "typhoon") multiplier = Number(state.settings.typhoonMultiplier) || 1;
      return applyRounding(calculation.amount * multiplier, state.settings.roundingMode, "item");
    }

    const hourlyBase = Number(employee.monthlySalary || 0) / 240;
    const earlyMinutes = dailyEarlyOvertime(employee, record);
    const firstBand = Math.min(120, earlyMinutes);
    const secondBand = Math.min(120, Math.max(0, earlyMinutes - 120));
    const beyond = Math.max(0, earlyMinutes - 240);
    let amount =
      firstBand / 60 * hourlyBase * (4 / 3) +
      secondBand / 60 * hourlyBase * (5 / 3) +
      beyond / 60 * hourlyBase * 2;
    if (day.type === "national") amount += Number(employee.monthlySalary || 0) / 30;
    if (day.type === "typhoon") {
      amount += minutes / 60 * hourlyBase * Math.max(0, Number(state.settings.typhoonMultiplier) - 1);
    }
    return applyRounding(amount, state.settings.roundingMode, "item");
  }

  function getMonthAttendance(employeeId, month) {
    return Object.values(state.attendance)
      .filter(record => record.employeeId === employeeId && record.date.startsWith(month))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getMonthLeaves(employeeId, month) {
    return Object.values(state.leaveRecords)
      .filter(record => record.employeeId === employeeId && record.date.startsWith(month))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function employeeLeaveSummary(employee, month) {
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    const year = month.slice(0, 4);
    const leaves = Object.values(state.leaveRecords)
      .filter(record => (
        record.employeeId === employee.id &&
        record.date.startsWith(year) &&
        record.date <= monthEnd
      ));
    const currentMonthLeaves = leaves.filter(leave => leave.date.startsWith(month));
    const restDays = currentMonthLeaves
      .filter(leave => leave.type === "monthly_rest")
      .reduce((sum, leave) => sum + Number(leave.days || 1), 0);
    const recordedAnnualDays = leaves
      .filter(leave => leave.type === "annual_leave")
      .reduce((sum, leave) => sum + Number(leave.days || 1), 0);
    const restByMonth = leaves
      .filter(leave => leave.type === "monthly_rest")
      .reduce((groups, leave) => {
        const key = leave.date.slice(0, 7);
        groups[key] = (groups[key] || 0) + Number(leave.days || 1);
        return groups;
      }, {});
    const quota = Number(state.settings.monthlyRestQuota || 7);
    const convertedAnnualDays = Object.values(restByMonth)
      .reduce((sum, days) => sum + Math.max(0, Number(days) - quota), 0);
    const ledgerAdjustment = state.leaveLedger
      .filter(entry => (
        entry.employeeId === employee.id &&
        String(entry.date || "").startsWith(year) &&
        entry.date <= monthEnd
      ))
      .reduce((sum, entry) => sum + Number(entry.days || 0), 0);
    const entitlement = Number(employee.annualLeave || 0) + ledgerAdjustment;
    const annualUsed = recordedAnnualDays + convertedAnnualDays;
    return {
      restDays,
      recordedAnnualDays,
      convertedAnnualDays,
      ledgerAdjustment,
      entitlement,
      annualUsed,
      annualRemaining: entitlement - annualUsed
    };
  }

  function applyRounding(value, mode, stage = "item") {
    if (mode === "item" && stage === "item") return Math.round(value);
    if (mode === "final" && stage === "final") return Math.round(value);
    if (mode === "none") return Math.round(value * 100) / 100;
    return value;
  }

  function dailyOvertimeBreakdown(employee, record) {
    if (record.status !== "confirmed") return { early: 0, late: 0, total: 0 };
    const schedule = scheduleForDate(employee, record.date);
    let scheduledStart = timeToMinutes(schedule.start);
    let scheduledEnd = timeToMinutes(schedule.end);
    if (scheduledStart === null || scheduledEnd === null) return { early: 0, late: 0, total: 0 };
    if (scheduledEnd <= scheduledStart) scheduledEnd += 24 * 60;
    const result = (record.segments || []).reduce((sum, segment) => {
      let start = timeToMinutes(segment.start);
      let end = timeToMinutes(segment.end);
      if (start === null || end === null) return sum;
      if (end <= start) end += 24 * 60;
      sum.early += Math.max(0, Math.min(end, scheduledStart) - start);
      sum.late += Math.max(0, end - Math.max(start, scheduledEnd));
      return sum;
    }, { early: 0, late: 0 });
    return { ...result, total: result.early + result.late };
  }

  function dailyEarlyOvertime(employee, record) {
    return dailyOvertimeBreakdown(employee, record).total;
  }

  function minuteInTimeBand(minute, startValue, endValue) {
    const start = timeToMinutes(startValue);
    const end = timeToMinutes(endValue);
    if (start === null || end === null || start === end) return false;
    const value = ((minute % (24 * 60)) + 24 * 60) % (24 * 60);
    return end > start ? value >= start && value < end : value >= start || value < end;
  }

  function hourlyRecordCalculation(employee, record, day) {
    let baseRate = Number(employee.hourlyRate) || 0;
    if (day.type === "weekend") baseRate = Number(employee.weekendRate) || baseRate;
    if (day.type === "national") baseRate = Number(employee.holidayRate) || baseRate;
    const peakRate = Number(employee.peakRate || 0);
    let amount = 0;
    let minutes = 0;
    (record.segments || []).forEach(segment => {
      let start = timeToMinutes(segment.start);
      let end = timeToMinutes(segment.end);
      if (start === null || end === null) return;
      if (end <= start) end += 24 * 60;
      for (let minute = start; minute < end; minute += 1) {
        const rate = peakRate && minuteInTimeBand(minute, employee.peakStart, employee.peakEnd)
          ? Math.max(baseRate, peakRate)
          : baseRate;
        amount += rate / 60;
        minutes += 1;
      }
    });
    return { amount, minutes, averageRate: minutes ? amount / minutes * 60 : baseRate };
  }

  function calculatePayroll(employee, month) {
    employee = employeeAt(employee, month);
    const mode = state.settings.roundingMode;
    const records = getMonthAttendance(employee.id, month);
    const confirmed = records.filter(record => record.status === "confirmed");
    const leaves = getMonthLeaves(employee.id, month);
    let regularPay = 0;
    let overtimePay = 0;
    let specialPay = 0;
    let regularMinutes = 0;
    let overtimeMinutes = 0;
    const detailLines = [];

    if (employee.payType === "hourly") {
      confirmed.forEach(record => {
        const minutes = recordMinutes(record);
        if (!minutes) return;
        const day = getDayInfo(record.date);
        const dailyProfile = employeeAt(employee, record.date);
        const calculation = hourlyRecordCalculation(dailyProfile, record, day);
        const rate = calculation.averageRate;
        const dailyRegular = calculation.amount;
        regularPay += dailyRegular;
        regularMinutes += minutes;

        let premium = 0;
        if (day.type === "national") {
          premium = dailyRegular * Math.max(0, Number(state.settings.nationalMultiplier) - 1);
        } else if (day.type === "typhoon") {
          premium = dailyRegular * Math.max(0, Number(state.settings.typhoonMultiplier) - 1);
        }
        specialPay += premium;

        detailLines.push({
          label: `${record.date.slice(5)} ${day.label}・${minutes} 分鐘 × ${decimal(rate, 2)} 元`,
          amount: applyRounding(dailyRegular + premium, mode, "item")
        });
      });
    } else {
      regularPay = Number(employee.monthlySalary) || 0;
      detailLines.push({ label: "固定月薪", amount: regularPay });
      const hourlyBase = regularPay / 240;

      confirmed.forEach(record => {
        const overtime = dailyOvertimeBreakdown(employee, record);
        const dailyOvertimeMinutes = overtime.total;
        if (dailyOvertimeMinutes > 0) {
          const firstBand = Math.min(120, dailyOvertimeMinutes);
          const secondBand = Math.min(120, Math.max(0, dailyOvertimeMinutes - 120));
          const beyond = Math.max(0, dailyOvertimeMinutes - 240);
          const dailyOvertime =
            firstBand / 60 * hourlyBase * (4 / 3) +
            secondBand / 60 * hourlyBase * (5 / 3) +
            beyond / 60 * hourlyBase * 2;
          overtimePay += dailyOvertime;
          overtimeMinutes += dailyOvertimeMinutes;
          const overtimeLabel = [
            overtime.early ? `提早 ${overtime.early} 分` : "",
            overtime.late ? `延後 ${overtime.late} 分` : ""
          ].filter(Boolean).join("、");
          detailLines.push({
            label: `${record.date.slice(5)} 加班（${overtimeLabel}）`,
            amount: applyRounding(dailyOvertime, mode, "item")
          });
        }

        const day = getDayInfo(record.date);
        const workedMinutes = recordMinutes(record);
        if (day.type === "national" && workedMinutes > 0) {
          const premium = regularPay / 30;
          specialPay += premium;
          detailLines.push({ label: `${record.date.slice(5)} ${day.label}出勤加給`, amount: applyRounding(premium, mode, "item") });
        } else if (day.type === "typhoon" && workedMinutes > 0) {
          const premium = workedMinutes / 60 * hourlyBase * Math.max(0, Number(state.settings.typhoonMultiplier) - 1);
          specialPay += premium;
          detailLines.push({ label: `${record.date.slice(5)} 颱風日出勤加給`, amount: applyRounding(premium, mode, "item") });
        }
        regularMinutes += workedMinutes;
      });
    }

    regularPay = applyRounding(regularPay, mode, "item");
    overtimePay = applyRounding(overtimePay, mode, "item");
    specialPay = applyRounding(specialPay, mode, "item");

    const applicableAdjustments = state.adjustments.filter(adjustment =>
      adjustment.employeeId === employee.id && adjustmentApplies(adjustment, month)
    );
    const earnings = applicableAdjustments
      .filter(adjustment => adjustment.type === "earning")
      .reduce((sum, adjustment) => sum + adjustmentAmount(adjustment), 0);
    let deductions = applicableAdjustments
      .filter(adjustment => adjustment.type === "deduction")
      .reduce((sum, adjustment) => sum + adjustmentAmount(adjustment), 0);

    applicableAdjustments.forEach(adjustment => {
      detailLines.push({
        label: `${adjustmentCategoryLabel(adjustment)}・${adjustment.name}`,
        amount: adjustment.type === "deduction" ? -adjustmentAmount(adjustment) : adjustmentAmount(adjustment)
      });
    });

    if (employee.payType === "monthly") {
      const unpaidDays = leaves.filter(leave => leave.type === "unpaid").reduce((sum, leave) => sum + Number(leave.days || 1), 0);
      if (unpaidDays > 0) {
        const unpaidDeduction = Number(employee.monthlySalary || 0) / 30 * unpaidDays;
        deductions += unpaidDeduction;
        detailLines.push({ label: `事假／無薪假 ${unpaidDays} 天`, amount: -applyRounding(unpaidDeduction, mode, "item") });
      }
      const sickDays = leaves.filter(leave => leave.type === "sick").reduce((sum, leave) => sum + Number(leave.days || 1), 0);
      if (sickDays > 0) {
        const sickRatio = Math.max(0, Math.min(1, Number(state.settings.sickPayRatio ?? 0.5)));
        const sickDeduction = Number(employee.monthlySalary || 0) / 30 * sickDays * (1 - sickRatio);
        deductions += sickDeduction;
        detailLines.push({
          label: `病假 ${sickDays} 天・給薪比例 ${decimal(sickRatio * 100, 0)}%`,
          amount: -applyRounding(sickDeduction, mode, "item")
        });
      }
    }

    const rawTotal = regularPay + overtimePay + specialPay + earnings - deductions;
    const total = applyRounding(rawTotal, mode, "final");
    const issues = records.filter(record => record.status !== "confirmed").length;
    const leaveSummary = employeeLeaveSummary(employee, month);

    return {
      employee,
      regularPay,
      overtimePay,
      specialPay,
      earnings,
      deductions,
      total,
      regularMinutes,
      overtimeMinutes,
      issues,
      detailLines,
      adjustments: applicableAdjustments,
      leaves,
      leaveSummary
    };
  }

  function calculateLivePayroll(month = state.settings.month) {
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
    return state.employees
      .filter(employee => (
        (employee.active || employee.endDate) &&
        (!employee.hireDate || employee.hireDate <= monthEnd) &&
        (!employee.endDate || employee.endDate >= monthStart)
      ))
      .map(employee => calculatePayroll(employee, month));
  }

  function payrollForMonth(month = state.settings.month, { live = false } = {}) {
    const snapshot = state.closedMonths?.[month]?.snapshot;
    if (!live && state.closedMonths?.[month]?.locked && Array.isArray(snapshot?.rows)) {
      return snapshot.rows;
    }
    return calculateLivePayroll(month);
  }

  function currentIssues() {
    const month = state.settings.month;
    const attendanceIssues = Object.values(state.attendance)
      .filter(record => record.date.startsWith(month) && record.status !== "confirmed")
      .map(record => ({
        ...record,
        level: record.status === "unreadable" ? "danger" : "warning",
        title: `${getEmployee(record.employeeId)?.name || "員工"}・${record.date.slice(5)}`,
        text: record.status === "unreadable" ? "打卡時間無法判斷" : "打卡紀錄等待人工確認"
      }));
    const employeeWarnings = [];
    const now = new Date();
    const todayString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const monthDates = dateRangeForMonth(month);

    state.employees.filter(employee => employee.active || employee.endDate).forEach(employee => {
      const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
      if ((employee.hireDate && employee.hireDate > monthEnd) || (employee.endDate && employee.endDate < `${month}-01`)) return;
      const monthEmployee = employeeAt(employee, month);
      const records = getMonthAttendance(employee.id, month);
      const leaveSummary = employeeLeaveSummary(employee, month);
      if (leaveSummary.annualRemaining < 0) {
        employeeWarnings.push({
          level: "danger",
          title: `${employee.name}年假不足`,
          text: `本年度累計使用 ${decimal(leaveSummary.annualUsed, 1)} 天，超出可用餘額 ${decimal(Math.abs(leaveSummary.annualRemaining), 1)} 天。`
        });
      }
      if (leaveSummary.restDays > Number(state.settings.monthlyRestQuota || 7)) {
        employeeWarnings.push({
          level: "warning",
          title: `${employee.name}月休超過基準`,
          text: `本月月休 ${decimal(leaveSummary.restDays, 2)} 天，超過部分會列入年假使用，請主管確認。`
        });
      }
      if (monthEmployee.payType === "hourly" && Number(monthEmployee.hourlyRate) < Number(state.settings.minimumHourlyWage || MINIMUM_HOURLY_WAGE_2026)) {
        employeeWarnings.push({ level: "danger", title: `${employee.name}時薪低於 ${state.settings.ruleYear} 最低工資`, text: `本月適用費率 ${monthEmployee.hourlyRate} 元。` });
      }
      if (monthEmployee.payType === "monthly" && Number(monthEmployee.monthlySalary) < Number(state.settings.minimumMonthlyWage || MINIMUM_MONTHLY_WAGE_2026)) {
        employeeWarnings.push({ level: "danger", title: `${employee.name}月薪低於 ${state.settings.ruleYear} 最低工資`, text: `本月適用月薪 ${monthEmployee.monthlySalary} 元。` });
      }
      if (!records.length) {
        employeeWarnings.push({
          level: "danger",
          title: `${employee.name}本月沒有工時`,
          text: "在職員工整月沒有任何打卡或人工紀錄，結算前必須確認。"
        });
      }
      records.forEach(record => {
        const minutes = recordMinutes(record);
        if (minutes > 12 * 60) {
          employeeWarnings.push({
            level: "danger",
            title: `${employee.name}・${record.date.slice(5)} 工時過長`,
            text: `目前紀錄 ${decimal(minutes / 60, 1)} 小時，請確認是否跨日或重複打卡。`
          });
        }
        const segments = (record.segments || []).map(segment => {
          let start = timeToMinutes(segment.start);
          let end = timeToMinutes(segment.end);
          if (start !== null && end !== null && end <= start) end += 24 * 60;
          return { start, end };
        }).filter(segment => segment.start !== null && segment.end !== null).sort((a, b) => a.start - b.start);
        if (segments.some((segment, index) => index > 0 && segment.start < segments[index - 1].end)) {
          employeeWarnings.push({
            level: "danger",
            title: `${employee.name}・${record.date.slice(5)} 時段重疊`,
            text: "同一天的工作時段互相重疊，請先修正。"
          });
        }
      });
      monthDates.forEach(date => {
        if (date > todayString) return;
        if ((employee.hireDate && date < employee.hireDate) || (employee.endDate && date > employee.endDate)) return;
        const schedule = scheduleForDate(employee, date);
        if (!schedule.expected) return;
        const key = attendanceKey(employee.id, date);
        if (!state.attendance[key] && !state.leaveRecords[key]) {
          employeeWarnings.push({
            level: "danger",
            title: `${employee.name}・${date.slice(5)} 缺少紀錄`,
            text: `排班 ${schedule.start || "未設定"}－${schedule.end || "未設定"}，但沒有打卡或假別。`
          });
        }
      });
    });

    if (Number(month.slice(0, 4)) !== Number(state.settings.ruleYear || 2026)) {
      employeeWarnings.push({
        level: "warning",
        title: `${month.slice(0, 4)} 年規則版本尚未更新`,
        text: `最低工資與國定假日目前仍以 ${state.settings.ruleYear || 2026} 年資料為基準，結算前請更新。`
      });
    }

    return { attendanceIssues, employeeWarnings };
  }

  function populateEmployeeSelects() {
    const activeEmployees = state.employees.filter(employee => employee.active);
    const monthStart = `${state.settings.month}-01`;
    const monthEnd = `${state.settings.month}-${String(daysInMonth(state.settings.month)).padStart(2, "0")}`;
    const historicalEmployeeIds = new Set(
      Object.values(state.attendance)
        .filter(record => record.date.startsWith(state.settings.month))
        .map(record => record.employeeId)
    );
    const monthEmployees = state.employees.filter(employee => (
      (employee.active || employee.endDate || historicalEmployeeIds.has(employee.id)) &&
      (!employee.hireDate || employee.hireDate <= monthEnd) &&
      (!employee.endDate || employee.endDate >= monthStart)
    ));
    const selectGroups = {
      "upload-employee": activeEmployees,
      "punch-clock-employee": activeEmployees,
      "attendance-employee": monthEmployees,
      "adjustment-employee": monthEmployees,
      "leave-ledger-employee": state.employees
    };
    Object.entries(selectGroups).forEach(([id, employees]) => {
      const select = $(`#${id}`);
      if (!select) return;
      const current = select.value;
      select.innerHTML = employees.map(employee =>
        `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`
      ).join("");
      if (employees.some(employee => employee.id === current)) select.value = current;
    });
  }

  function renderCloseProgress() {
    const month = state.settings.month;
    const records = Object.values(state.attendance).filter(record => record.date.startsWith(month));
    const issues = currentIssues();
    const issueCount = issues.attendanceIssues.length + issues.employeeWarnings.filter(issue => issue.level === "danger").length;
    const monthState = state.closedMonths?.[month] || {};
    const workflow = monthState.workflowStatus || "draft";
    const steps = [
      { key: "upload", done: records.length > 0 },
      { key: "review", done: records.length > 0 && issueCount === 0 },
      { key: "calculate", done: ["review", "approved", "paid"].includes(workflow) },
      { key: "lock", done: Boolean(monthState.locked) },
      { key: "export", done: Boolean(monthState.exportedAt) }
    ];
    const firstPending = steps.findIndex(step => !step.done);
    $$("#close-progress-list [data-close-step]").forEach((item, index) => {
      item.classList.toggle("is-done", steps[index].done);
      item.classList.toggle("is-current", index === firstPending);
    });
    const completed = steps.filter(step => step.done).length;
    $("#close-progress-summary").textContent = monthState.locked
      ? `已鎖定・${completed}/5`
      : `${completed}/5 已完成`;
  }

  function renderAudit() {
    const entries = (state.auditLog || [])
      .filter(entry => entry.month === state.settings.month)
      .slice(0, 12);
    $("#audit-list").innerHTML = entries.length ? entries.map(entry => {
      const time = new Date(entry.timestamp);
      const displayTime = Number.isNaN(time.getTime())
        ? ""
        : new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time);
      return `
        <div class="audit-item">
          <span class="audit-dot"></span>
          <div><strong>${escapeHtml(entry.action)}</strong><p>${escapeHtml(entry.detail || "—")}</p></div>
          <small>${escapeHtml(entry.actor || "本機使用者")}<br>${escapeHtml(displayTime)}</small>
        </div>
      `;
    }).join("") : '<p class="empty-copy">本月尚無修改紀錄；新增或複核打卡後會自動留存。</p>';
  }

  function renderEmployeeShares() {
    const shares = state.employeeShares
      .filter(share => share.month === state.settings.month)
      .slice(0, 20);
    $("#employee-share-list").innerHTML = shares.length ? shares.map(share => `
      <div class="audit-item" data-share-id="${escapeHtml(share.id)}">
        <span class="audit-dot"></span>
        <div>
          <strong>${escapeHtml(getEmployee(share.employeeId)?.name || "員工")}・限時核對</strong>
          <p class="share-response-copy">等待員工回覆・有效至 ${escapeHtml(new Date(share.expiresAt).toLocaleString("zh-TW"))}</p>
        </div>
        <a class="text-btn" href="${escapeHtml(share.url)}" target="_blank" rel="noreferrer">開啟</a>
      </div>
    `).join("") : '<p class="empty-copy">本月尚未建立員工核對連結。</p>';
  }

  async function refreshEmployeeShareStatuses() {
    const shares = state.employeeShares.filter(share => share.month === state.settings.month).slice(0, 20);
    const button = $("#refresh-share-status");
    button.disabled = true;
    button.textContent = "更新中…";
    await Promise.allSettled(shares.map(async share => {
      const token = new URL(share.url, location.origin).searchParams.get("token") || "";
      const response = await fetch(`/api/employee-share?token=${encodeURIComponent(token)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      const row = $(`[data-share-id="${CSS.escape(share.id)}"]`);
      const copy = row ? $(".share-response-copy", row) : null;
      if (!copy) return;
      if (response.status === 410) {
        copy.textContent = "連結已過期";
      } else if (result.response?.status === "confirmed") {
        copy.textContent = `員工已確認資料正確・${new Date(result.response.submittedAt).toLocaleString("zh-TW")}`;
      } else if (result.response?.status === "question") {
        copy.textContent = `員工提出問題：${result.response.message}`;
      } else if (response.ok) {
        copy.textContent = `等待員工回覆・有效至 ${new Date(result.expiresAt).toLocaleString("zh-TW")}`;
      } else {
        copy.textContent = result.message || "無法讀取回覆狀態";
      }
    }));
    button.disabled = false;
    button.textContent = "更新回覆狀態";
  }

  function renderDashboard() {
    const month = state.settings.month;
    const payroll = payrollForMonth(month);
    const total = payroll.reduce((sum, row) => sum + row.total, 0);
    const minutes = payroll.reduce((sum, row) => sum + row.regularMinutes + row.overtimeMinutes, 0);
    const issues = currentIssues();
    const issueCount = issues.attendanceIssues.length + issues.employeeWarnings.length;

    $("#dashboard-month-label").textContent = monthLabel(month);
    $("#metric-payroll").textContent = money(total);
    $("#metric-employees").textContent = `${payroll.length} 人`;
    $("#metric-hours").textContent = `${decimal(minutes / 60, 1)} 小時`;
    $("#metric-issues").textContent = `${issueCount} 筆`;

    $("#dashboard-payroll-body").innerHTML = payroll.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.employee.name)}</strong>${row.issues ? `<br><small class="muted-text">${row.issues} 筆待確認</small>` : ""}</td>
        <td><span class="status-pill ${row.employee.payType === "monthly" ? "status-review" : "status-confirmed"}">${row.employee.payType === "monthly" ? "月薪" : "時薪"}</span></td>
        <td>${decimal((row.regularMinutes + row.overtimeMinutes) / 60, 1)} 小時</td>
        <td class="number"><strong>${money(row.total)}</strong></td>
      </tr>
    `).join("");

    const actions = [
      ...issues.attendanceIssues.slice(0, 4).map(record => ({
        level: record.level || (record.status === "unreadable" ? "danger" : "warning"),
        title: record.title || `${getEmployee(record.employeeId)?.name || "員工"}・${record.date.slice(5)}`,
        text: record.text || (record.status === "unreadable" ? "打卡時間無法判斷" : "OCR 結果等待人工確認")
      })),
      ...issues.employeeWarnings.slice(0, 4)
    ];

    $("#dashboard-actions").innerHTML = actions.length ? actions.map(action => `
      <div class="action-item ${action.level}">
        <span class="action-icon">${action.level === "danger" ? "!" : "核"}</span>
        <div><strong>${escapeHtml(action.title)}</strong><p>${escapeHtml(action.text)}</p></div>
      </div>
    `).join("") : `
      <div class="action-item">
        <span class="action-icon">✓</span>
        <div><strong>目前沒有待確認項目</strong><p>可以繼續上傳打卡或進行薪資試算。</p></div>
      </div>
    `;
    renderCloseProgress();
  }

  function dayTypeMarkup(date) {
    const day = getDayInfo(date);
    const cls = day.type === "weekday" ? "" : day.type;
    return `<span class="type-pill ${cls}">${escapeHtml(day.label)}</span>`;
  }

  function renderAttendance() {
    const select = $("#attendance-employee");
    const employeeId = select.value || select.options[0]?.value;
    if (!employeeId) {
      $("#attendance-body-first").innerHTML = "";
      $("#attendance-body-second").innerHTML = "";
      $("#attendance-card-list").innerHTML = '<p class="empty-copy">此月份沒有在職員工。</p>';
      return;
    }
    select.value = employeeId;
    const month = state.settings.month;
    const dates = dateRangeForMonth(month);
    const rowMarkup = date => {
      const key = attendanceKey(employeeId, date);
      const record = state.attendance[key];
      const leave = state.leaveRecords[key];
      const minutes = recordMinutes(record);
      const status = record?.status;
      const day = getDayInfo(date);
      return `
        <tr class="attendance-row day-${day.type}">
          <td class="attendance-day-cell">
            <strong>${Number(date.slice(-2))}</strong>
            <small>週${weekdayLabel(date)}・${escapeHtml(day.label)}</small>
          </td>
          <td class="attendance-time-cell">${formatSegments(record?.segments)}</td>
          <td class="number">${minutes ? decimal(minutes, 0) : "—"}</td>
          <td class="attendance-state-cell" title="${escapeHtml(record?.source || "")}">
            ${leave ? `<span class="status-pill status-review">${escapeHtml(leaveLabel(leave.type))}</span>` : ""}
            ${status ? `<span class="status-pill status-${status}">${statusLabel(status)}</span>` : '<span class="muted-text">無紀錄</span>'}
          </td>
          <td><button class="text-btn edit-attendance compact-edit" type="button" data-date="${date}">核對</button></td>
        </tr>
      `;
    };
    $("#attendance-body-first").innerHTML = dates
      .filter(date => Number(date.slice(-2)) <= 15)
      .map(rowMarkup)
      .join("");
    $("#attendance-body-second").innerHTML = dates
      .filter(date => Number(date.slice(-2)) >= 16)
      .map(rowMarkup)
      .join("");

    $("#attendance-card-list").innerHTML = dates.map(date => {
      const key = attendanceKey(employeeId, date);
      const record = state.attendance[key];
      const leave = state.leaveRecords[key];
      const minutes = recordMinutes(record);
      const day = getDayInfo(date);
      return `
        <article class="attendance-date-card day-${day.type}">
          <div class="attendance-card-date">
            <span>${Number(date.slice(-2))}</span>
            <div><strong>星期${weekdayLabel(date)}</strong><small>${escapeHtml(day.label)}</small></div>
            ${record?.status ? `<i class="dot ${record.status}" title="${statusLabel(record.status)}"></i>` : ""}
          </div>
          <div class="attendance-card-times">${formatSegments(record?.segments)}</div>
          <div class="attendance-card-meta">
            <span>${minutes ? `${decimal(minutes, 0)} 分鐘` : "尚無工時"}</span>
            <span>${leave ? leaveLabel(leave.type) : statusLabel(record?.status)}</span>
            <button class="text-btn edit-attendance" type="button" data-date="${date}">核對</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function previousMonth(month) {
    const [year, value] = month.split("-").map(Number);
    const date = new Date(year, value - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function renderPayrollInsights(payroll) {
    const month = state.settings.month;
    const priorMonth = previousMonth(month);
    const previous = payrollForMonth(priorMonth);
    const total = payroll.reduce((sum, row) => sum + row.total, 0);
    const previousTotal = previous.reduce((sum, row) => sum + row.total, 0);
    const variance = total - previousTotal;
    const sales = Number(state.settings.monthlySales?.[month] || 0);
    const ratio = sales > 0 ? total / sales * 100 : 0;
    $("#monthly-sales").value = sales || "";
    $("#payroll-insights").innerHTML = `
      <article class="metric-card accent-green"><span>本月人事成本</span><strong>${money(total)}</strong><small>${monthLabel(month)}</small></article>
      <article class="metric-card"><span>較上月增減</span><strong class="${variance > 0 ? "negative" : "positive"}">${variance > 0 ? "+" : ""}${money(variance)}</strong><small>上月 ${money(previousTotal)}</small></article>
      <article class="metric-card accent-gold"><span>人事成本率</span><strong>${sales ? `${decimal(ratio, 1)}%` : "待填營業額"}</strong><small>${sales ? `營業額 ${money(sales)}` : "填入營業額後自動計算"}</small></article>
    `;
    const previousMap = new Map(previous.map(row => [row.employee.id, row.total]));
    $("#payroll-variance-list").innerHTML = payroll.map(row => {
      const old = Number(previousMap.get(row.employee.id) || 0);
      const change = row.total - old;
      return `
        <div class="variance-row">
          <strong>${escapeHtml(row.employee.name)}</strong>
          <span>上月 ${money(old)}</span>
          <span>本月 ${money(row.total)}</span>
          <b class="${change > 0 ? "negative" : "positive"}">${change > 0 ? "+" : ""}${money(change)}</b>
        </div>
      `;
    }).join("");
  }

  function renderWorkflow() {
    const monthState = state.closedMonths?.[state.settings.month] || {};
    const status = monthState.workflowStatus || (monthState.locked ? "approved" : "draft");
    const labels = { draft: "草稿", review: "待覆核", approved: "已核准", paid: "已發薪" };
    const pill = $("#payroll-workflow-status");
    pill.textContent = labels[status] || "草稿";
    pill.dataset.status = status;
    $("#submit-payroll-review").disabled = status !== "draft" || !hasPermission("payroll");
    $("#approve-payroll").disabled = status !== "review" || !hasPermission("approve");
    $("#mark-payroll-paid").disabled = status !== "approved" || !hasPermission("approve");
  }

  function closeBlockers() {
    const issues = currentIssues();
    return [
      ...issues.attendanceIssues,
      ...issues.employeeWarnings.filter(issue => issue.level === "danger")
    ];
  }

  function requestCloseOverride(actionLabel) {
    const blockers = closeBlockers();
    if (!blockers.length) return "";
    const reason = window.prompt(
      `目前仍有 ${blockers.length} 筆重要異常。若確定要${actionLabel}，請輸入主管覆核原因；取消或留白將停止操作。`,
      ""
    );
    return reason?.trim() || null;
  }

  function renderPayroll() {
    const payroll = payrollForMonth();
    $("#payroll-body").innerHTML = payroll.map(row => {
      const earningsNames = row.adjustments
        .filter(adjustment => adjustment.type === "earning")
        .map(adjustment => adjustment.name);
      const deductionNames = row.adjustments
        .filter(adjustment => adjustment.type === "deduction")
        .map(adjustment => adjustment.name);
      return `
        <tr>
          <td><strong>${escapeHtml(row.employee.name)}</strong></td>
          <td>${row.employee.payType === "monthly" ? "月薪制" : "時薪制"}</td>
          <td class="number">${money(row.regularPay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
          <td class="number">${money(row.overtimePay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
          <td class="number">${money(row.specialPay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
          <td class="number payroll-adjustment-cell">
            <strong>${money(row.earnings)}</strong>
            <small title="${escapeHtml(earningsNames.join("、"))}">${earningsNames.length ? escapeHtml(earningsNames.join("、")) : "無"}</small>
          </td>
          <td class="number payroll-adjustment-cell deduction-cell">
            <strong>${money(row.deductions)}</strong>
            <small title="${escapeHtml(deductionNames.join("、"))}">${deductionNames.length ? escapeHtml(deductionNames.join("、")) : "無"}</small>
          </td>
          <td class="number"><strong>${money(row.total, state.settings.roundingMode === "none" ? 2 : 0)}</strong></td>
          <td><button class="text-btn view-payslip" type="button" data-employee-id="${row.employee.id}">9:16 出席明細</button></td>
        </tr>
      `;
    }).join("");

    const total = payroll.reduce((sum, row) => sum + row.total, 0);
    $("#payroll-total").textContent = money(total, state.settings.roundingMode === "none" ? 2 : 0);

    const { attendanceIssues, employeeWarnings } = currentIssues();
    const warning = $("#payroll-warning");
    if (attendanceIssues.length || employeeWarnings.length) {
      warning.hidden = false;
      warning.textContent = `目前有 ${attendanceIssues.length} 筆打卡待確認、${employeeWarnings.length} 筆規則提醒。待確認打卡不會納入薪資。`;
    } else {
      warning.hidden = true;
    }
    renderAdjustments();
    renderPayrollInsights(payroll);
    renderWorkflow();
    renderAudit();
    renderEmployeeShares();
    $("#audit-actor-label").textContent = cloudUser ? `${cloudUser.email}・${roleLabel()}` : "本機使用者";
    const lockButton = $("#toggle-month-lock");
    lockButton.textContent = isMonthLocked() ? "解除本月鎖定" : "鎖定本月";
    lockButton.classList.toggle("is-locked", isMonthLocked());
  }

  function renderAdjustments() {
    const month = state.settings.month;
    if (!$("#adjustment-effective-from").value) $("#adjustment-effective-from").value = month;
    const snapshotRows = state.closedMonths?.[month]?.snapshot?.rows;
    const list = state.closedMonths?.[month]?.locked && Array.isArray(snapshotRows)
      ? snapshotRows.flatMap(row => row.adjustments || [])
      : state.adjustments.filter(adjustment => adjustmentApplies(adjustment, month));
    const categories = [
      { id: "bonus", label: "獎金", icon: "獎" },
      { id: "gift", label: "禮金", icon: "禮" },
      { id: "allowance", label: "其他加給", icon: "加" },
      { id: "deduction", label: "扣款", icon: "扣" }
    ];
    const totals = Object.fromEntries(categories.map(category => [category.id, 0]));
    list.forEach(adjustment => {
      totals[adjustmentCategory(adjustment)] += adjustmentAmount(adjustment);
    });
    $("#adjustment-summary").innerHTML = categories.map(category => `
      <article class="adjustment-summary-card category-${category.id}">
        <span>${category.icon}</span>
        <div><small>${category.label}</small><strong>${money(totals[category.id])}</strong></div>
      </article>
    `).join("");
    $("#adjustment-list").innerHTML = list.length ? categories.map(category => {
      const items = list.filter(adjustment => adjustmentCategory(adjustment) === category.id);
      if (!items.length) return "";
      return `
        <section class="adjustment-group category-${category.id}">
          <header>
            <span>${category.icon}</span>
            <strong>${category.label}</strong>
            <small>${items.length} 筆・${money(totals[category.id])}</small>
          </header>
          <div class="adjustment-rows">
            ${items.map(adjustment => {
              const employee = getEmployee(adjustment.employeeId);
              return `
                <div class="adjustment-row">
                  <span class="adjustment-employee">${escapeHtml(employee?.name || "已刪除員工")}</span>
                  <strong>${escapeHtml(adjustment.name)}</strong>
                  <small>${adjustment.quantity || 1} × ${money(adjustment.unitRate || adjustment.amount)}・${adjustment.effectiveFrom || month}${adjustment.effectiveTo ? `～${adjustment.effectiveTo}` : (adjustment.recurring ? " 起" : "")}</small>
                  <b class="${category.id === "deduction" ? "negative" : "positive"}">${category.id === "deduction" ? "−" : "+"}${money(adjustmentAmount(adjustment))}</b>
                  <button type="button" class="remove-adjustment" data-id="${adjustment.id}" aria-label="刪除 ${escapeHtml(adjustment.name)}">×</button>
                </div>
              `;
            }).join("")}
          </div>
        </section>
      `;
    }).join("") : '<p class="empty-copy">本月沒有獎金、禮金、其他加給或扣款。</p>';
  }

  function employeeRateMarkup(employee) {
    const leaveSummary = employeeLeaveSummary(employee, state.settings.month);
    if (employee.payType === "monthly") {
      return `
        <div><span>固定月薪</span><strong>${money(employee.monthlySalary)}</strong></div>
        <div><span>固定班別</span><strong>${employee.scheduleStart ? `${employee.scheduleStart}－${employee.scheduleEnd || "未設定"}` : "未設定"}</strong></div>
        <div><span>平日時薪基礎</span><strong>${money(Number(employee.monthlySalary || 0) / 240, 2)}</strong></div>
        <div><span>年假餘額</span><strong>${decimal(leaveSummary.annualRemaining, 2)} 天</strong></div>
      `;
    }
    return `
      <div><span>平日時薪</span><strong>${money(employee.hourlyRate)}</strong></div>
      <div><span>週末時薪</span><strong>${money(employee.weekendRate || employee.hourlyRate)}</strong></div>
      <div><span>國定假日基礎</span><strong>${money(employee.holidayRate || employee.hourlyRate)}</strong></div>
      <div><span>年假餘額</span><strong>${decimal(leaveSummary.annualRemaining, 2)} 天</strong></div>
    `;
  }

  function renderEmployees() {
    $("#employee-grid").innerHTML = state.employees.map(employee => {
      const current = employeeAt(employee, state.settings.month);
      return `
      <article class="employee-card ${current.active ? "" : "is-inactive"}">
        <div class="employee-card-header">
          <span class="employee-avatar">${escapeHtml(current.name.slice(0, 1))}</span>
          <div class="employee-card-actions">
            <span class="status-pill ${current.active ? "status-confirmed" : "status-unreadable"}">${current.active ? "在職" : "停用"}</span>
            <button class="text-btn edit-employee" type="button" data-id="${current.id}">編輯</button>
          </div>
        </div>
        <h3>${escapeHtml(current.name)}</h3>
        <p>${current.payType === "monthly" ? "月薪制" : "時薪制"}${current.hireDate ? `・${escapeHtml(current.hireDate)} 到職` : "・到職日未設定"}${current.endDate ? `・${escapeHtml(current.endDate)} 離職` : ""}・${employee.payHistory.length} 筆費率歷史</p>
        <div class="employee-rate-grid">${employeeRateMarkup(current)}</div>
      </article>
    `;
    }).join("");
    renderLeaveLedger();
  }

  function renderLeaveLedger() {
    const entries = state.leaveLedger
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 20);
    $("#leave-ledger-list").innerHTML = entries.length ? entries.map(entry => `
      <div class="audit-item">
        <span class="audit-dot"></span>
        <div>
          <strong>${escapeHtml(getEmployee(entry.employeeId)?.name || "已刪除員工")}・${Number(entry.days) >= 0 ? "+" : ""}${decimal(entry.days, 3)} 天</strong>
          <p>${escapeHtml(entry.note || "年假調整")}</p>
        </div>
        <small>${escapeHtml(entry.date || "")}<br>${escapeHtml(entry.actor || "")}</small>
      </div>
    `).join("") : '<p class="empty-copy">尚無年假取得或人工調整紀錄。</p>';
  }

  function renderAccessRoles() {
    const roles = state.settings.accessRoles || {};
    const items = Object.entries(roles);
    $("#access-role-list").innerHTML = items.length ? items.map(([email, role]) => `
      <div class="access-role-item">
        <div><strong>${escapeHtml(email)}</strong><small>${escapeHtml(roleLabel(role))}</small></div>
        ${hasPermission("roles") ? `<button class="danger-text-btn remove-access-role" type="button" data-email="${escapeHtml(email)}">移除</button>` : ""}
      </div>
    `).join("") : '<p class="empty-copy">第一位登入的管理者會自動成為店主。</p>';
    $("#access-role-form").hidden = !hasPermission("roles");
  }

  function renderSettings() {
    $("#national-multiplier").value = state.settings.nationalMultiplier;
    $("#typhoon-multiplier").value = state.settings.typhoonMultiplier;
    $("#rounding-mode").value = state.settings.roundingMode;
    $("#monthly-rest-quota").value = state.settings.monthlyRestQuota;
    $("#sick-pay-ratio").value = state.settings.sickPayRatio;
    $("#rule-year").value = state.settings.ruleYear;
    $("#minimum-hourly-wage").value = state.settings.minimumHourlyWage;
    $("#minimum-monthly-wage").value = state.settings.minimumMonthlyWage;
    const importedHistory = state.settings.importedSources?.[BUNDLED_HISTORY_ID];
    $("#historical-import-status").innerHTML = importedHistory
      ? `<strong>歷史資料已匯入</strong><span>${escapeHtml(importedHistory.source)}・2026 年 1～6 月</span>`
      : "<strong>尚未匯入歷史工資</strong><span>請重新整理頁面或確認歷史資料檔是否已部署。</span>";
    const monthYear = state.settings.month.slice(0, 4);
    const days = state.specialDays
      .filter(day => day.date.startsWith(monthYear))
      .sort((a, b) => a.date.localeCompare(b.date));
    $("#special-day-list").innerHTML = days.map(day => `
      <div class="special-day-item">
        <strong>${escapeHtml(day.date.slice(5))}</strong>
        <span>${escapeHtml(day.label)}</span>
        <span class="type-pill ${day.type}">${day.type === "national" ? "國定／補假" : "颱風日"}</span>
        <button type="button" class="remove-special-day" data-id="${day.id}" aria-label="刪除">×</button>
      </div>
    `).join("");
    renderAccessRoles();
  }

  function renderUploads() {
    const list = $("#upload-list");
    if (!runtimeUploads.length) {
      list.className = "upload-list empty-state";
      list.innerHTML = "<p>尚未選擇照片</p>";
      return;
    }
    list.className = "upload-list";
    list.innerHTML = runtimeUploads.map(upload => `
      <div class="upload-item">
        <img src="${upload.url}" alt="${escapeHtml(upload.file.name)} 預覽" />
        <div>
          <strong>${escapeHtml(upload.file.name)}</strong>
          <small>${escapeHtml(getEmployee(upload.employeeId)?.name || "")}・${upload.half === "first" ? "1～15 日" : "16～31 日"}・${escapeHtml(upload.statusText)}</small>
        </div>
        <div class="upload-item-actions">
          <button type="button" data-upload-action="recognize" data-id="${upload.id}">AI 辨識並核對</button>
          ${upload.reviewRows?.length ? `<button type="button" data-upload-action="quick-review" data-id="${upload.id}">快速核對 ${upload.reviewRows.length} 日</button>` : ""}
          <button type="button" data-upload-action="view" data-id="${upload.id}">查看原圖</button>
          ${upload.ocrPreviewUrl ? `<button type="button" data-upload-action="view-ocr" data-id="${upload.id}">查看辨識影像</button>` : ""}
          <button type="button" data-upload-action="remove" data-id="${upload.id}">移除</button>
        </div>
      </div>
    `).join("");
  }

  function renderAll() {
    $("#global-month").value = state.settings.month;
    populateEmployeeSelects();
    renderDashboard();
    renderAttendance();
    renderPayroll();
    renderEmployees();
    renderSettings();
    renderUploads();
    updateCloudUi();
  }

  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("is-active", view.id === `view-${name}`));
    $$(".nav-item").forEach(item => item.classList.toggle("is-active", item.dataset.view === name));
    $$(".mobile-bottom-nav [data-view]").forEach(item => item.classList.toggle("is-active", item.dataset.view === name));
    const view = $(`#view-${name}`);
    $("#page-title").textContent = view?.dataset.title || "薪資管理";
    document.body.classList.remove("menu-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleEmployeeFields() {
    const isMonthly = $("#employee-pay-type").value === "monthly";
    $$(".hourly-field", $("#employee-form")).forEach(field => { field.hidden = isMonthly; });
    $$(".monthly-field", $("#employee-form")).forEach(field => { field.hidden = !isMonthly; });
  }

  function openEmployeeDialog(employeeId = "") {
    if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
    const employee = employeeId ? getEmployee(employeeId) : null;
    const profile = employee ? employeeAt(employee, state.settings.month) : null;
    $("#employee-dialog-title").textContent = employee ? `編輯 ${employee.name}` : "新增員工";
    $("#employee-id").value = employee?.id || "";
    $("#employee-name").value = employee?.name || "";
    $("#employee-pay-type").value = profile?.payType || "hourly";
    $("#employee-hourly-rate").value = profile?.hourlyRate || 200;
    $("#employee-weekend-rate").value = profile?.weekendRate || profile?.hourlyRate || 200;
    $("#employee-holiday-rate").value = profile?.holidayRate || profile?.hourlyRate || 200;
    $("#employee-peak-rate").value = profile?.peakRate || "";
    $("#employee-peak-start").value = profile?.peakStart || "";
    $("#employee-peak-end").value = profile?.peakEnd || "";
    $("#employee-monthly-salary").value = profile?.monthlySalary || 0;
    $("#employee-schedule-start").value = profile?.scheduleStart || "08:00";
    $("#employee-schedule-end").value = profile?.scheduleEnd || "15:00";
    $("#employee-rate-effective").value = `${state.settings.month}-01`;
    $("#employee-hire-date").value = employee?.hireDate || "";
    $("#employee-end-date").value = employee?.endDate || "";
    $("#employee-annual-leave").value = employee?.annualLeave || 0;
    $("#employee-punch-pin").value = "";
    $$('input[name="employee-workday"]').forEach(input => {
      const day = Number(input.value);
      const row = input.closest("[data-workday]");
      const weekly = profile?.weeklySchedule?.[day] || profile?.weeklySchedule?.[String(day)];
      input.checked = weekly ? weekly.expected !== false : (profile?.expectedWorkdays || []).includes(day);
      $(".workday-start", row).value = weekly?.start || profile?.scheduleStart || "";
      $(".workday-end", row).value = weekly?.end || profile?.scheduleEnd || "";
    });
    $("#employee-rate-history").innerHTML = employee?.payHistory?.length
      ? `<strong>既有費率歷史</strong>${employee.payHistory.slice().reverse().map(item => `
          <span>${escapeHtml(item.effectiveFrom)}・${item.payType === "monthly" ? `月薪 ${money(item.monthlySalary)}` : `時薪 ${money(item.hourlyRate)}／週末 ${money(item.weekendRate)}`}</span>
        `).join("")}`
      : '<span class="muted-text">儲存後會建立第一筆費率歷史。</span>';
    $("#employee-active").checked = employee ? employee.active : true;
    toggleEmployeeFields();
    $("#employee-dialog").showModal();
  }

  function renderSegmentInputs(segments = [{ start: "", end: "" }]) {
    $("#segment-list").innerHTML = segments.map((segment, index) => `
      <div class="segment-row" data-segment-index="${index}">
        <input type="time" class="segment-start" value="${escapeHtml(segment.start || "")}" aria-label="第 ${index + 1} 段上班時間" />
        <span>到</span>
        <input type="time" class="segment-end" value="${escapeHtml(segment.end || "")}" aria-label="第 ${index + 1} 段下班時間" />
        <button type="button" class="remove-segment" aria-label="刪除此時段">刪除</button>
      </div>
    `).join("");
  }

  function openAttendanceDialog(date = "") {
    if (!requirePermission("attendance") || !requireUnlockedMonth()) return;
    const employeeId = $("#attendance-employee").value;
    const selectedDate = date || `${state.settings.month}-01`;
    const key = attendanceKey(employeeId, selectedDate);
    const record = state.attendance[key];
    const leave = state.leaveRecords[key];
    attendanceDialogEmployeeId = employeeId;
    attendanceDialogOriginalDate = selectedDate;
    $("#attendance-dialog-title").textContent = `${getEmployee(employeeId)?.name || ""}・${selectedDate}`;
    $("#attendance-date").value = selectedDate;
    $("#attendance-date").min = `${state.settings.month}-01`;
    $("#attendance-date").max = `${state.settings.month}-${String(daysInMonth(state.settings.month)).padStart(2, "0")}`;
    $("#attendance-status").value = record?.status || "confirmed";
    $("#attendance-leave-type").value = leave?.type || "";
    $("#attendance-leave-days").value = leave?.days || 1;
    const override = state.shiftOverrides?.[key];
    $("#attendance-shift-start").value = override?.start || "";
    $("#attendance-shift-end").value = override?.end || "";
    $("#attendance-note").value = record?.note || leave?.note || "";
    $("#delete-attendance").hidden = !record && !leave;
    saveAndAdvanceAttendance = false;
    const preview = $("#attendance-source-preview");
    const sourceName = record?.source?.replace(/^OCR：/, "");
    const upload = sourceName ? runtimeUploads.find(item => item.file?.name === sourceName) : null;
    if (record?.source) {
      preview.hidden = false;
      preview.innerHTML = `
        ${upload?.url ? `<img src="${upload.url}" alt="${escapeHtml(sourceName)} 原始打卡照片" />` : '<div class="source-placeholder">原始照片僅在本次上傳期間可預覽</div>'}
        <div>
          <strong>${escapeHtml(record.source)}</strong>
          <p>辨識信心 ${decimal(record.confidence || 0, 0)}%・請對照照片後確認時間</p>
          ${upload?.url ? `<button class="text-btn" type="button" data-preview-upload="${upload.id}">放大查看原圖</button>` : ""}
        </div>
      `;
    } else {
      preview.hidden = true;
      preview.innerHTML = "";
    }
    renderSegmentInputs(record?.segments?.length ? record.segments : [{ start: "", end: "" }]);
    $("#attendance-dialog").showModal();
  }

  function openPayslip(employeeId) {
    const employee = getEmployee(employeeId);
    if (!employee) return;
    const month = state.settings.month;
    currentPayslipEmployeeId = employeeId;
    const row = payrollForMonth(month).find(item => item.employee.id === employeeId) || calculatePayroll(employee, month);
    const records = getMonthAttendance(employeeId, month);
    const recordMap = new Map(records.map(record => [record.date, record]));
    const leaveMap = new Map(getMonthLeaves(employeeId, month).map(leave => [leave.date, leave]));
    const confirmed = records.filter(record => record.status === "confirmed");
    const groupedMinutes = confirmed.reduce((totals, record) => {
      const type = getDayInfo(record.date).type;
      totals[type] = (totals[type] || 0) + recordMinutes(record);
      return totals;
    }, {});
    const applicableAdjustments = state.adjustments.filter(adjustment =>
      adjustment.employeeId === employee.id && adjustmentApplies(adjustment, month)
    );
    const monthEmployee = employeeAt(employee, month);
    const facts = monthEmployee.payType === "hourly"
      ? [
          ["平日時薪", money(monthEmployee.hourlyRate)],
          ["週末時薪", money(monthEmployee.weekendRate || monthEmployee.hourlyRate)],
          ["國定假日基礎", money(monthEmployee.holidayRate || monthEmployee.hourlyRate)],
          ["平日工作分鐘", `${groupedMinutes.weekday || 0} 分`],
          ["週末工作分鐘", `${groupedMinutes.weekend || 0} 分`],
          ["國定／颱風分鐘", `${(groupedMinutes.national || 0) + (groupedMinutes.typhoon || 0)} 分`]
        ]
      : [
          ["固定月薪", money(monthEmployee.monthlySalary)],
          ["固定班別", monthEmployee.scheduleStart ? `${monthEmployee.scheduleStart}－${monthEmployee.scheduleEnd || "未設定"}` : "未設定"],
          ["平日時薪基礎", money(Number(monthEmployee.monthlySalary || 0) / 240, 2)],
          ["本月月休", `${decimal(row.leaveSummary.restDays, 1)} 天`],
          ["轉抵／使用年假", `${decimal(row.leaveSummary.annualUsed, 1)} 天`],
          ["年假試算餘額", `${decimal(row.leaveSummary.annualRemaining, 1)} 天`]
        ];
    const calculationRows = [
      ["一般薪資", row.regularPay],
      ...(row.overtimePay ? [["加班費", row.overtimePay]] : []),
      ...(row.specialPay ? [["國定假日／颱風加給", row.specialPay]] : []),
      ...applicableAdjustments.map(adjustment => [
        `${adjustmentCategoryLabel(adjustment)}・${adjustment.name}`,
        adjustment.type === "deduction" ? -adjustmentAmount(adjustment) : adjustmentAmount(adjustment)
      ]),
      ...(!applicableAdjustments.length ? [["其他加給／扣款", 0]] : [])
    ];

    $("#payslip-title").textContent = `${employee.name}・${monthLabel(month)}出席與薪資明細`;
    $("#payslip-content").innerHTML = `
      <article class="employee-statement" data-employee-id="${escapeHtml(employee.id)}" data-employee-name="${escapeHtml(employee.name)}" data-month="${escapeHtml(month)}">
        <header class="statement-name">
          <strong>${escapeHtml(employee.name)}</strong>
          <span>${monthLabel(month)}・${monthEmployee.payType === "monthly" ? "月薪制" : "時薪制"}</span>
        </header>
        <table class="statement-table">
          <thead>
            <tr>
              <th>日期</th><th>星期</th><th>上班時間</th><th>下班時間</th>
              <th>共計時間</th><th>總分鐘</th><th>當日薪資</th>
            </tr>
          </thead>
          <tbody>
            ${dateRangeForMonth(month).map(date => {
              const record = recordMap.get(date);
              const leave = leaveMap.get(date);
              const day = getDayInfo(date);
              const times = statementTimes(record);
              const minutes = record?.status === "confirmed" ? recordMinutes(record) : 0;
              const dailyPay = dailyStatementPay(employee, record);
              const statusCopy = record?.status && record.status !== "confirmed" ? statusLabel(record.status) : "";
              const wageCopy = statusCopy || (leave ? leaveLabel(leave.type) : (record
                ? (monthEmployee.payType === "monthly" && !dailyPay ? "月薪內" : money(dailyPay))
                : "—"));
              return `
                <tr class="statement-day-${day.type} ${dailyPay && day.type !== "weekday" ? "has-premium" : ""}">
                  <td>${Number(date.slice(-2))}</td>
                  <td>星期${weekdayLabel(date)}</td>
                  <td>${record?.status === "unreadable" ? "無法判斷" : escapeHtml(times.start)}</td>
                  <td>${record?.status === "unreadable" ? "無法判斷" : escapeHtml(times.end)}</td>
                  <td>${minutes ? minutesAsClock(minutes) : "—"}</td>
                  <td>${minutes || "—"}</td>
                  <td>${escapeHtml(wageCopy)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
        <section class="statement-calculation">
          <h3>薪資計算明細</h3>
          <div class="statement-facts">
            ${facts.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
          </div>
          <div class="statement-pay-lines">
            ${calculationRows.map(([label, amount]) => `
              <div><span>${escapeHtml(label)}</span><strong class="${amount < 0 ? "negative" : ""}">${amount < 0 ? "−" : ""}${money(Math.abs(amount))}</strong></div>
            `).join("")}
          </div>
          <div class="statement-total"><span>本月實領薪資</span><strong>${money(row.total)}</strong></div>
        </section>
        <footer class="statement-legend">
          <span class="weekend">週末六日</span>
          <span class="special">國定假日／颱風假</span>
          <span class="premium">薪資加成</span>
        </footer>
        ${row.issues ? `<p class="statement-warning">有 ${row.issues} 筆打卡尚未確認，未納入本次薪資。</p>` : ""}
      </article>
    `;
    $("#payslip-dialog").showModal();
  }

  async function downloadStatementJpg() {
    const statement = $(".employee-statement", $("#payslip-content"));
    const button = $("#download-statement-jpg");
    if (!statement) return;
    if (!window.html2canvas) {
      toast("JPG 元件尚未載入，請確認網路後再試一次。");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "正在產生圖片…";
    try {
      const captured = await window.html2canvas(statement, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false
      });
      const output = document.createElement("canvas");
      output.width = 1080;
      output.height = 1920;
      const context = output.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, output.width, output.height);
      const scale = Math.min(output.width / captured.width, output.height / captured.height);
      const width = captured.width * scale;
      const height = captured.height * scale;
      context.drawImage(captured, (output.width - width) / 2, (output.height - height) / 2, width, height);

      const blob = await new Promise(resolve => output.toBlob(resolve, "image/jpeg", 0.95));
      if (!blob) throw new Error("JPG_EXPORT_FAILED");
      const employeeName = statement.dataset.employeeName || "員工";
      const safeName = employeeName.replace(/[\\/:*?"<>|]/g, "_");
      downloadBlob(blob, `${safeName}_${statement.dataset.month}_出席薪資明細.jpg`, "image/jpeg");
      logAudit("下載員工出席明細", `${employeeName}・JPG 1080 × 1920`);
      saveState();
      renderAll();
      toast("9:16 JPG 明細已儲存。");
    } catch (error) {
      console.warn("Unable to export statement JPG", error);
      toast("圖片產生失敗，請重新開啟明細後再試一次。");
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function employeeShareStatement(employeeId) {
    const employee = getEmployee(employeeId);
    const month = state.settings.month;
    const row = payrollForMonth(month).find(item => item.employee.id === employeeId);
    if (!employee || !row) return null;
    const records = dateRangeForMonth(month).map(date => {
      const record = state.attendance[attendanceKey(employeeId, date)];
      const leave = state.leaveRecords[attendanceKey(employeeId, date)];
      return {
        date,
        weekday: `星期${weekdayLabel(date)}`,
        dayType: getDayInfo(date).label,
        segments: record?.segments || [],
        minutes: record?.status === "confirmed" ? recordMinutes(record) : 0,
        status: record ? statusLabel(record.status) : "無紀錄",
        leave: leave ? leaveLabel(leave.type) : ""
      };
    });
    return {
      employeeId,
      employeeName: employee.name,
      month,
      monthLabel: monthLabel(month),
      attendance: records,
      payroll: {
        regularPay: row.regularPay,
        overtimePay: row.overtimePay,
        specialPay: row.specialPay,
        earnings: row.earnings,
        deductions: row.deductions,
        total: row.total,
        detailLines: row.detailLines
      }
    };
  }

  async function createEmployeeShare() {
    if (!cloudUser) {
      toast("請先登入管理者帳號，才能建立安全核對連結。");
      return;
    }
    if (!requirePermission("payroll")) return;
    const statement = employeeShareStatement(currentPayslipEmployeeId);
    if (!statement) return;
    const button = $("#create-employee-share");
    button.disabled = true;
    button.textContent = "建立中…";
    try {
      const response = await fetch("/api/employee-share", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement,
          expiresInDays: Number(state.settings.shareExpiryDays || 7)
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "無法建立核對連結。");
      const url = new URL(result.url, location.origin).href;
      state.employeeShares.unshift({
        id: uid("share"),
        employeeId: statement.employeeId,
        month: statement.month,
        url,
        expiresAt: result.expiresAt,
        createdAt: new Date().toISOString(),
        createdBy: cloudUser.email || ""
      });
      state.employeeShares = state.employeeShares.slice(0, 100);
      await navigator.clipboard.writeText(url).catch(() => {});
      logAudit("建立員工核對連結", `${statement.employeeName}・有效至 ${result.expiresAt}`);
      saveState();
      window.prompt("核對連結已建立並嘗試複製，請傳給員工：", url);
    } catch (error) {
      toast(error instanceof Error ? error.message : "無法建立核對連結。");
    } finally {
      button.disabled = false;
      button.textContent = "建立員工核對連結";
    }
  }

  function addUploadFiles(files) {
    const employeeId = $("#upload-employee").value;
    const selectedHalf = $("#upload-half").value;
    [...files].filter(file => file.type.startsWith("image/")).forEach(file => {
      const stem = file.name.replace(/\.[^.]+$/, "").trim();
      const inferredHalf = /1$/.test(stem) ? "first" : (/2$/.test(stem) ? "second" : selectedHalf);
      runtimeUploads.push({
        id: uid("upload"),
        file,
        url: URL.createObjectURL(file),
        employeeId,
        half: inferredHalf,
        status: "queued",
        statusText: inferredHalf !== selectedHalf ? "已依檔名判斷日期範圍・等待辨識" : "等待辨識"
      });
    });
    renderUploads();
  }

  function parseCsvLine(line) {
    const values = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"' && quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = !quoted;
      } else if ((character === "," || character === "\t") && !quoted) {
        values.push(value.trim());
        value = "";
      } else {
        value += character;
      }
    }
    values.push(value.trim());
    return values;
  }

  async function importAttendanceCsv(file) {
    if (!requirePermission("attendance") || !requireUnlockedMonth()) return;
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("CSV 沒有可匯入的資料列。");
    const headers = parseCsvLine(lines[0]).map(value => value.toLowerCase());
    const column = names => headers.findIndex(header => names.includes(header));
    const employeeColumn = column(["員工", "姓名", "employee", "name"]);
    const dateColumn = column(["日期", "date"]);
    const startColumn = column(["上班", "上班時間", "start", "clock in"]);
    const endColumn = column(["下班", "下班時間", "end", "clock out"]);
    if ([employeeColumn, dateColumn, startColumn, endColumn].some(index => index < 0)) {
      throw new Error("CSV 必須包含員工、日期、上班、下班欄位。");
    }
    let imported = 0;
    let skipped = 0;
    lines.slice(1).forEach(line => {
      const values = parseCsvLine(line);
      const employee = state.employees.find(item => item.name.trim() === String(values[employeeColumn] || "").trim());
      const date = String(values[dateColumn] || "").replaceAll("/", "-");
      const start = String(values[startColumn] || "").padStart(5, "0");
      const end = String(values[endColumn] || "").padStart(5, "0");
      if (!employee || !/^\d{4}-\d{2}-\d{2}$/.test(date) || isMonthLocked(date.slice(0, 7)) || timeToMinutes(start) === null || timeToMinutes(end) === null) {
        skipped += 1;
        return;
      }
      const key = attendanceKey(employee.id, date);
      const existing = state.attendance[key] || {
        employeeId: employee.id,
        date,
        segments: [],
        status: "confirmed",
        source: `CSV：${file.name}`,
        confidence: 100,
        note: ""
      };
      existing.segments = [...(existing.segments || []), { start, end }];
      existing.status = "confirmed";
      state.attendance[key] = existing;
      imported += 1;
    });
    logAudit("匯入打卡鐘 CSV", `${file.name}・成功 ${imported} 列・略過 ${skipped} 列`);
    saveState();
    renderAll();
    toast(`CSV 已匯入 ${imported} 列${skipped ? `，略過 ${skipped} 列` : ""}。`);
  }

  const OCR_CELL_WIDTH = 180;
  const OCR_ROW_HEIGHT = 72;
  const OCR_COLUMN_COUNT = 6;

  function setOcrPhase(label, start, span) {
    ocrPhase = { label, start, span };
    const box = $("#ocr-progress");
    box.hidden = false;
    $("#ocr-progress-label").textContent = label;
    $("#ocr-progress-percent").textContent = `${Math.round(start)}%`;
    $("#ocr-progress-bar").value = start;
  }

  function updateOcrProgress(progress) {
    const box = $("#ocr-progress");
    box.hidden = false;
    const phaseProgress = Math.max(0, Math.min(1, Number(progress.progress || 0)));
    const pct = Math.round(ocrPhase.start + phaseProgress * ocrPhase.span);
    const loadingLabels = {
      "loading tesseract core": "載入辨識核心",
      "initializing tesseract": "初始化辨識",
      "loading language traineddata": "載入數字辨識資料",
      "initializing api": "準備辨識"
    };
    $("#ocr-progress-label").textContent = loadingLabels[progress.status] || ocrPhase.label || "處理照片";
    $("#ocr-progress-percent").textContent = `${pct}%`;
    $("#ocr-progress-bar").value = pct;
  }

  async function getOcrWorker() {
    if (ocrWorker) return ocrWorker;
    if (!window.Tesseract) throw new Error("OCR_LIBRARY_UNAVAILABLE");
    ocrWorker = await window.Tesseract.createWorker("eng", 1, { logger: updateOcrProgress });
    await ocrWorker.setParameters({
      tessedit_char_whitelist: "0123456789:.",
      preserve_interword_spaces: "1"
    });
    return ocrWorker;
  }

  function normalizeOcrTime(text) {
    const cleaned = String(text || "").replace(/[Oo]/g, "0").trim();
    const colonCandidates = [...cleaned.matchAll(/(\d{1,2})\s*[:.]\s*(\d{2})/g)]
      .map(match => ({ hour: Number(match[1]), minute: Number(match[2]), index: match.index || 0 }))
      .filter(value => value.hour <= 23 && value.minute <= 59);
    if (colonCandidates.length) {
      const value = colonCandidates.at(-1);
      return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
    }

    const groups = cleaned.match(/\d+/g) || [];
    const fourDigitCandidates = [];
    const threeDigitCandidates = [];
    groups.forEach(group => {
      [4, 3].forEach(length => {
        for (let index = Math.max(0, group.length - 7); index <= group.length - length; index += 1) {
          const value = group.slice(index, index + length);
          const hour = Number(value.slice(0, length - 2));
          const minute = Number(value.slice(-2));
          if (hour <= 23 && minute <= 59) {
            (length === 4 ? fourDigitCandidates : threeDigitCandidates).push({ hour, minute, index });
          }
        }
      });
    });
    const value = fourDigitCandidates.at(-1) || threeDigitCandidates.at(-1);
    if (!value) return null;
    return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  }

  function linearFit(points, valueKey, startDay) {
    if (!points.length) return { intercept: 0, slope: 0 };
    const xs = points.map(point => point.day - startDay);
    const ys = points.map(point => point[valueKey]);
    const xMean = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const yMean = ys.reduce((sum, value) => sum + value, 0) / ys.length;
    const denominator = xs.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
    const slope = denominator
      ? xs.reduce((sum, value, index) => sum + (value - xMean) * (ys[index] - yMean), 0) / denominator
      : 0;
    return { intercept: yMean - slope * xMean, slope };
  }

  function findGridGeometry(words, half, width, height) {
    const startDay = half === "first" ? 1 : 16;
    const count = half === "first" ? 15 : 16;
    const endDay = startDay + count - 1;
    const candidates = (words || []).map(word => {
      const digits = String(word.text || "").replace(/\D/g, "");
      const day = digits.length <= 2 ? Number(digits) : 0;
      const bbox = word.bbox || {};
      return {
        day,
        x: ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2,
        y: ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2,
        confidence: Number(word.confidence || 0)
      };
    }).filter(item =>
      item.day >= startDay &&
      item.day <= endDay &&
      item.x < width * 0.38 &&
      item.y > height * 0.28 &&
      item.y < height * 0.93
    );

    let best = { score: -Infinity, matches: [] };
    candidates.forEach((first, firstIndex) => {
      candidates.slice(firstIndex + 1).forEach(second => {
        const dayDelta = second.day - first.day;
        if (Math.abs(dayDelta) < 3) return;
        const spacing = (second.y - first.y) / dayDelta;
        if (spacing < height * 0.018 || spacing > height * 0.055) return;
        const xSlope = (second.x - first.x) / dayDelta;
        if (Math.abs(xSlope) > spacing * 0.35) return;
        const matches = [];
        let errorTotal = 0;
        for (let day = startDay; day <= endDay; day += 1) {
          const predictedY = first.y + (day - first.day) * spacing;
          const predictedX = first.x + (day - first.day) * xSlope;
          const options = candidates
            .filter(item => item.day === day)
            .map(item => ({
              item,
              yError: Math.abs(item.y - predictedY),
              xError: Math.abs(item.x - predictedX)
            }))
            .filter(option => option.yError < spacing * 0.48 && option.xError < spacing * 0.9)
            .sort((a, b) => (a.yError + a.xError * 0.4) - (b.yError + b.xError * 0.4));
          if (options[0]) {
            matches.push(options[0].item);
            errorTotal += options[0].yError / spacing + options[0].xError / spacing;
          }
        }
        const score = matches.length * 100 - errorTotal * 12;
        if (score > best.score) best = { score, matches };
      });
    });

    if (best.matches.length >= 4) {
      const yFit = linearFit(best.matches, "y", startDay);
      const xFit = linearFit(best.matches, "x", startDay);
      const averageConfidence = best.matches.reduce((sum, item) => sum + item.confidence, 0) / best.matches.length;
      return {
        startDay,
        count,
        yStart: yFit.intercept,
        spacing: yFit.slope,
        xStart: xFit.intercept,
        xSlope: xFit.slope,
        confidence: Math.round(Math.min(100, averageConfidence * (0.65 + best.matches.length / count * 0.35))),
        anchors: best.matches.length,
        method: "日期欄自動校正"
      };
    }

    const fallback = half === "first"
      ? { yStart: height * 0.4, spacing: height * 0.029, xStart: width * 0.18 }
      : { yStart: height * 0.395, spacing: height * 0.03, xStart: width * 0.19 };
    return {
      startDay,
      count,
      ...fallback,
      xSlope: 0,
      confidence: 25,
      anchors: best.matches.length,
      method: "版型預設校正"
    };
  }

  function isColoredGridPixel(red, green, blue) {
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    return maximum - minimum > 18 && maximum > 55 && maximum < 250;
  }

  function findLocalBoundary(imageData, width, height, centerX, predictedY, spacing) {
    const pixels = imageData.data;
    const x0 = Math.max(0, Math.round(centerX - spacing * 0.72));
    const x1 = Math.min(width - 1, Math.round(centerX + spacing * 0.72));
    const y0 = Math.max(0, Math.round(predictedY - spacing * 0.55));
    const y1 = Math.min(height - 1, Math.round(predictedY + spacing * 0.55));
    let bestY = predictedY;
    let bestScore = 0;
    for (let y = y0; y <= y1; y += 1) {
      let score = 0;
      for (let x = x0; x <= x1; x += 2) {
        const index = (y * width + x) * 4;
        if (isColoredGridPixel(pixels[index], pixels[index + 1], pixels[index + 2])) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    return bestScore >= (x1 - x0) * 0.08 ? bestY : predictedY;
  }

  function preprocessOcrCell(context, x, y, width, height) {
    const image = context.getImageData(x, y, width, height);
    const pixels = image.data;
    const histogram = new Uint32Array(256);
    let sampleCount = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (isColoredGridPixel(red, green, blue)) continue;
      const luminance = Math.round(red * 0.3 + green * 0.59 + blue * 0.11);
      histogram[luminance] += 1;
      sampleCount += 1;
    }
    let running = 0;
    let median = 190;
    for (let value = 0; value < histogram.length; value += 1) {
      running += histogram[value];
      if (running >= sampleCount * 0.5) {
        median = value;
        break;
      }
    }
    const threshold = Math.max(85, Math.min(205, median - 28));
    const raw = new Uint8Array(width * height);
    for (let pixel = 0; pixel < raw.length; pixel += 1) {
      const index = pixel * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const luminance = red * 0.3 + green * 0.59 + blue * 0.11;
      raw[pixel] = !isColoredGridPixel(red, green, blue) && luminance < threshold ? 1 : 0;
    }

    const cleaned = new Uint8Array(raw.length);
    for (let row = 1; row < height - 1; row += 1) {
      for (let column = 1; column < width - 1; column += 1) {
        const pixel = row * width + column;
        if (!raw[pixel]) continue;
        let neighbors = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            neighbors += raw[(row + offsetY) * width + column + offsetX];
          }
        }
        if (neighbors < 2) continue;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            cleaned[(row + offsetY) * width + column + offsetX] = 1;
          }
        }
      }
    }

    for (let row = 0; row < height; row += 1) {
      let count = 0;
      for (let column = 0; column < width; column += 1) count += cleaned[row * width + column];
      if (count > width * 0.55) {
        for (let column = 0; column < width; column += 1) cleaned[row * width + column] = 0;
      }
    }
    for (let column = 0; column < width; column += 1) {
      let count = 0;
      for (let row = 0; row < height; row += 1) count += cleaned[row * width + column];
      if (count > height * 0.65) {
        for (let row = 0; row < height; row += 1) cleaned[row * width + column] = 0;
      }
    }

    let inkPixels = 0;
    for (let pixel = 0; pixel < cleaned.length; pixel += 1) {
      const value = cleaned[pixel] ? 0 : 255;
      if (cleaned[pixel]) inkPixels += 1;
      const index = pixel * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    context.putImageData(image, x, y);
    return inkPixels / cleaned.length;
  }

  function buildNormalizedTimeSheet(bitmap, geometry) {
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    sourceContext.drawImage(bitmap, 0, 0);
    const sourceData = sourceContext.getImageData(0, 0, source.width, source.height);

    const canvas = document.createElement("canvas");
    canvas.width = OCR_CELL_WIDTH * OCR_COLUMN_COUNT;
    canvas.height = OCR_ROW_HEIGHT * geometry.count;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const density = Array.from({ length: geometry.count }, () => Array(OCR_COLUMN_COUNT).fill(0));
    const reviewCanvases = [];

    for (let rowIndex = 0; rowIndex < geometry.count; rowIndex += 1) {
      const dayOffset = rowIndex;
      const rowCenterY = geometry.yStart + geometry.spacing * dayOffset;
      const dayCenterX = geometry.xStart + geometry.xSlope * dayOffset;
      const columnWidth = geometry.spacing * 2.02;
      const reviewCanvas = document.createElement("canvas");
      reviewCanvas.width = 1100;
      reviewCanvas.height = 260;
      const reviewContext = reviewCanvas.getContext("2d");
      reviewContext.fillStyle = "#f4f5f2";
      reviewContext.fillRect(0, 0, reviewCanvas.width, reviewCanvas.height);
      const reviewX = Math.max(0, dayCenterX + geometry.spacing * 0.48);
      const reviewY = Math.max(0, rowCenterY - geometry.spacing * 0.92);
      const reviewWidth = Math.max(
        1,
        Math.min(source.width - reviewX, columnWidth * OCR_COLUMN_COUNT)
      );
      const reviewHeight = Math.max(
        1,
        Math.min(source.height - reviewY, geometry.spacing * 3.35)
      );
      reviewContext.save();
      reviewContext.filter = "contrast(135%) brightness(108%) saturate(65%)";
      reviewContext.drawImage(
        bitmap,
        reviewX,
        reviewY,
        reviewWidth,
        reviewHeight,
        0,
        0,
        reviewCanvas.width,
        reviewCanvas.height
      );
      reviewContext.restore();
      for (let column = 0; column < OCR_COLUMN_COUNT; column += 1) {
        const cellLeft = dayCenterX + geometry.spacing * 0.52 + column * columnWidth;
        const cellCenterX = cellLeft + columnWidth / 2;
        const predictedBoundary = rowCenterY + geometry.spacing * 0.5;
        const boundary = findLocalBoundary(
          sourceData,
          source.width,
          source.height,
          cellCenterX,
          predictedBoundary,
          geometry.spacing
        );
        const sourceX = cellLeft + columnWidth * 0.14;
        const sourceY = boundary - geometry.spacing * 0.9;
        const sourceWidth = columnWidth * 0.84;
        const sourceHeight = geometry.spacing * 0.82;
        const destinationX = column * OCR_CELL_WIDTH + 4;
        const destinationY = rowIndex * OCR_ROW_HEIGHT + 6;
        const destinationWidth = OCR_CELL_WIDTH - 8;
        const destinationHeight = OCR_ROW_HEIGHT - 12;
        const boundedX = Math.max(0, Math.min(source.width - 1, sourceX));
        const boundedY = Math.max(0, Math.min(source.height - 1, sourceY));
        const boundedWidth = Math.max(1, Math.min(source.width - boundedX, sourceWidth));
        const boundedHeight = Math.max(1, Math.min(source.height - boundedY, sourceHeight));
        context.drawImage(
          bitmap,
          boundedX,
          boundedY,
          boundedWidth,
          boundedHeight,
          destinationX,
          destinationY,
          destinationWidth,
          destinationHeight
        );
        density[rowIndex][column] = preprocessOcrCell(
          context,
          destinationX,
          destinationY,
          destinationWidth,
          destinationHeight
        );
      }
      reviewCanvases.push(reviewCanvas);
    }
    return { canvas, density, geometry, reviewCanvases };
  }

  function extractNormalizedRows(words, sheet) {
    const rows = Array.from({ length: sheet.geometry.count }, (_, index) => ({
      day: sheet.geometry.startDay + index,
      cells: Array.from({ length: OCR_COLUMN_COUNT }, (_, column) => ({
        textParts: [],
        confidenceParts: [],
        density: sheet.density[index][column]
      }))
    }));

    (words || []).forEach(word => {
      const bbox = word.bbox || {};
      const x = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2;
      const y = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2;
      const rowIndex = Math.floor(y / OCR_ROW_HEIGHT);
      const column = Math.floor(x / OCR_CELL_WIDTH);
      if (!rows[rowIndex]?.cells[column]) return;
      rows[rowIndex].cells[column].textParts.push({ x, text: String(word.text || "") });
      rows[rowIndex].cells[column].confidenceParts.push(Number(word.confidence || 0));
    });

    return rows.map(row => {
      row.cells = row.cells.map(cell => {
        const rawText = cell.textParts.sort((a, b) => a.x - b.x).map(part => part.text).join("");
        const confidence = cell.confidenceParts.length
          ? cell.confidenceParts.reduce((sum, value) => sum + value, 0) / cell.confidenceParts.length
          : 0;
        return {
          rawText,
          time: normalizeOcrTime(rawText),
          confidence,
          hasInk: cell.density > 0.012
        };
      });
      row.segments = [];
      for (let column = 0; column < OCR_COLUMN_COUNT; column += 2) {
        const start = row.cells[column];
        const end = row.cells[column + 1];
        if (start.time && end.time) {
          row.segments.push({ start: start.time, end: end.time });
        }
      }
      row.hasPartial = row.cells.some((cell, index) => {
        const partner = row.cells[index % 2 === 0 ? index + 1 : index - 1];
        return (cell.time || cell.hasInk) && !(cell.time && partner?.time);
      });
      row.hasInk = row.cells.some(cell => cell.hasInk);
      const recognizedCells = row.cells.filter(cell => cell.time);
      row.confidence = recognizedCells.length
        ? recognizedCells.reduce((sum, cell) => sum + cell.confidence, 0) / recognizedCells.length
        : 0;
      row.rawText = row.cells.map(cell => cell.rawText).filter(Boolean).join("／");
      return row;
    });
  }

  function createLabeledOcrPreview(sheet) {
    const marginLeft = 58;
    const headerHeight = 30;
    const canvas = document.createElement("canvas");
    canvas.width = sheet.canvas.width + marginLeft;
    canvas.height = sheet.canvas.height + headerHeight;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sheet.canvas, marginLeft, headerHeight);
    context.fillStyle = "#1f5b45";
    context.font = "bold 14px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("日期", marginLeft / 2, headerHeight / 2);
    ["上午上班", "上午下班", "下午上班", "下午下班", "加班上班", "加班下班"].forEach((label, index) => {
      context.fillText(label, marginLeft + OCR_CELL_WIDTH * (index + 0.5), headerHeight / 2);
    });
    context.strokeStyle = "#d8ddd9";
    context.lineWidth = 1;
    for (let row = 0; row <= sheet.geometry.count; row += 1) {
      const y = headerHeight + row * OCR_ROW_HEIGHT;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(canvas.width, y);
      context.stroke();
      if (row < sheet.geometry.count) {
        context.fillStyle = "#26372f";
        context.fillText(
          String(sheet.geometry.startDay + row),
          marginLeft / 2,
          y + OCR_ROW_HEIGHT / 2
        );
      }
    }
    for (let column = 0; column <= OCR_COLUMN_COUNT; column += 1) {
      const x = marginLeft + column * OCR_CELL_WIDTH;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, canvas.height);
      context.stroke();
    }
    return canvas;
  }

  function setUploadOcrPreview(upload, canvas) {
    if (upload.ocrPreviewUrl) URL.revokeObjectURL(upload.ocrPreviewUrl);
    canvas.toBlob(blob => {
      if (!blob) return;
      upload.ocrPreviewUrl = URL.createObjectURL(blob);
      renderUploads();
    }, "image/png");
  }

  function buildUploadReviewRows(sheet, rows) {
    return rows.map(row => {
      const cropDay = row.cropDay || row.day;
      const rowIndex = cropDay - sheet.geometry.startDay;
      const suggestedSegments = Array.from({ length: 3 }, (_, segmentIndex) => ({
        start: row.cells[segmentIndex * 2]?.time || "",
        end: row.cells[segmentIndex * 2 + 1]?.time || ""
      }));
      return {
        day: row.day,
        image: sheet.reviewCanvases[rowIndex]?.toDataURL("image/jpeg", 0.9) || "",
        suggestedSegments,
        hasGuess: suggestedSegments.some(segment => segment.start || segment.end),
        hasInk: Boolean(row.hasInk),
        confidence: Math.round(Number(row.confidence) || 0),
        dateUncertain: Boolean(row.dateUncertain),
        aiNote: row.aiNote || ""
      };
    });
  }

  function openOcrQuickReview(uploadId) {
    const upload = runtimeUploads.find(item => item.id === uploadId);
    if (!upload?.reviewRows?.length) {
      toast("這張照片尚未建立可核對的日期裁切。");
      return;
    }
    ocrReviewUploadId = uploadId;
    const employee = getEmployee(upload.employeeId);
    $("#ocr-review-title").textContent = `${employee?.name || "員工"}・${upload.half === "first" ? "1～15 日" : "16～31 日"}快速核對`;
    $("#ocr-review-list").innerHTML = upload.reviewRows.map(row => {
      const date = `${state.settings.month}-${String(row.day).padStart(2, "0")}`;
      return `
        <article class="ocr-review-row" data-day="${row.day}" data-has-ink="${row.hasInk ? "true" : "false"}">
          <div class="ocr-review-date">
            <label class="ocr-review-day-field">
              <span>實際日期</span>
              <span class="ocr-review-day-input"><input class="ocr-review-day" type="number" min="1" max="${daysInMonth(state.settings.month)}" value="${row.day}" /> 日</span>
            </label>
            <span class="ocr-review-weekday">星期${weekdayLabel(date)}</span>
            ${row.hasGuess
              ? `<span class="status-pill status-review">AI ${row.confidence || 0}%</span>`
              : '<span class="status-pill status-unreadable">請人工讀取</span>'}
            ${row.dateUncertain ? '<span class="status-pill status-unreadable">日期待確認</span>' : ""}
            <label><input class="ocr-review-skip" type="checkbox" /> 當日無打卡</label>
          </div>
          <a href="${row.image}" target="_blank" rel="noopener" title="開啟放大裁切">
            <img class="ocr-review-crop" src="${row.image}" alt="${row.day} 日六格打卡放大圖" />
          </a>
          <div class="ocr-review-segments">
            ${row.suggestedSegments.map((segment, index) => `
              <div class="ocr-review-segment">
                <span>第 ${index + 1} 段</span>
                <input class="ocr-review-start" type="time" value="${escapeHtml(segment.start)}" aria-label="${row.day} 日第 ${index + 1} 段上班" />
                <span>到</span>
                <input class="ocr-review-end" type="time" value="${escapeHtml(segment.end)}" aria-label="${row.day} 日第 ${index + 1} 段下班" />
              </div>
            `).join("")}
            ${row.aiNote ? `<small class="ocr-review-ai-note">${escapeHtml(row.aiNote)}</small>` : ""}
          </div>
        </article>
      `;
    }).join("");
    $("#ocr-review-dialog").showModal();
  }

  function saveOcrQuickReview() {
    const upload = runtimeUploads.find(item => item.id === ocrReviewUploadId);
    if (!upload || !requireUnlockedMonth()) return;
    const reviewRows = $$(".ocr-review-row", $("#ocr-review-list"));
    reviewRows.forEach(row => row.classList.remove("has-error"));
    const entries = reviewRows.map(reviewRow => {
      const starts = $$(".ocr-review-start", reviewRow);
      const ends = $$(".ocr-review-end", reviewRow);
      return {
        element: reviewRow,
        originalDay: Number(reviewRow.dataset.day),
        day: Number($(".ocr-review-day", reviewRow).value),
        hasInk: reviewRow.dataset.hasInk === "true",
        skip: $(".ocr-review-skip", reviewRow).checked,
        segments: starts.map((input, index) => ({
          start: input.value,
          end: ends[index].value
        })).filter(segment => segment.start || segment.end)
      };
    });

    const usedDates = new Map();
    let hasError = false;
    entries.forEach(entry => {
      if (entry.skip || (!entry.segments.length && !entry.hasInk)) return;
      if (entry.day < 1 || entry.day > daysInMonth(state.settings.month)) {
        entry.element.classList.add("has-error");
        hasError = true;
        return;
      }
      if (usedDates.has(entry.day)) {
        entry.element.classList.add("has-error");
        usedDates.get(entry.day).classList.add("has-error");
        hasError = true;
      } else {
        usedDates.set(entry.day, entry.element);
      }
      const selectedDate = `${state.settings.month}-${String(entry.day).padStart(2, "0")}`;
      const selectedRecord = state.attendance[attendanceKey(upload.employeeId, selectedDate)];
      if (entry.day !== entry.originalDay && selectedRecord?.status === "confirmed") {
        entry.element.classList.add("has-error");
        hasError = true;
      }
    });
    if (hasError) {
      toast("日期有重複、超出範圍，或該日期已有確認紀錄；紅框處請先修正。");
      return;
    }

    let confirmedCount = 0;
    let partialCount = 0;
    entries.forEach(entry => {
      const date = `${state.settings.month}-${String(entry.day).padStart(2, "0")}`;
      const key = attendanceKey(upload.employeeId, date);
      const originalDate = `${state.settings.month}-${String(entry.originalDay).padStart(2, "0")}`;
      const originalKey = attendanceKey(upload.employeeId, originalDate);
      const originalRecord = state.attendance[originalKey];
      if (entry.day !== entry.originalDay && state.attendance[originalKey]?.status !== "confirmed") {
        delete state.attendance[originalKey];
        delete state.leaveRecords[originalKey];
      }
      if (state.attendance[key]?.status === "confirmed") return;
      if (entry.skip) {
        delete state.attendance[key];
        delete state.leaveRecords[key];
        return;
      }
      if (!entry.segments.length) {
        if (entry.hasInk) {
          if (originalRecord && originalRecord.status !== "confirmed") {
            state.attendance[key] = { ...originalRecord, date };
          }
          return;
        }
        const existing = state.attendance[originalKey];
        const sameUploadSource = existing?.source === `OCR：${upload.file.name}` ||
          existing?.source === `AI：${upload.file.name}`;
        if (existing?.status !== "confirmed" && sameUploadSource) {
          delete state.attendance[originalKey];
        }
        return;
      }
      const complete = entry.segments.every(segment => segment.start && segment.end);
      state.attendance[key] = {
        employeeId: upload.employeeId,
        date,
        segments: entry.segments,
        status: complete ? "confirmed" : "unreadable",
        source: `人工核對：${upload.file.name}`,
        confidence: complete ? 100 : 0,
        note: complete
          ? "由打卡格放大圖人工核對完成。"
          : "快速核對仍有不完整時間，請再次確認。"
      };
      if (complete) confirmedCount += 1;
      else partialCount += 1;
    });
    logAudit(
      "完成打卡快速核對",
      `${getEmployee(upload.employeeId)?.name || "員工"}・確認 ${confirmedCount} 日${partialCount ? `・未完整 ${partialCount} 日` : ""}`
    );
    saveState();
    $("#ocr-review-dialog").close();
    renderAll();
    showView("attendance");
    toast(`已儲存 ${confirmedCount} 日確認紀錄${partialCount ? `；${partialCount} 日仍需補齊` : ""}。`);
  }

  function isValidAiTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
    return Boolean(match && Number(match[1]) <= 23 && Number(match[2]) <= 59);
  }

  function createScaledCanvas(bitmap, source, maximumWidth, maximumHeight, filter = "none") {
    const scale = Math.min(
      maximumWidth / source.width,
      maximumHeight / source.height,
      source.allowUpscale ? 2 : 1
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = filter;
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.filter = "none";
    return canvas;
  }

  function prepareAiImages(bitmap) {
    const cropX = Math.round(bitmap.width * 0.08);
    const cropY = Math.round(bitmap.height * 0.27);
    const cropWidth = Math.round(bitmap.width * 0.74);
    const cropHeight = Math.round(bitmap.height * 0.64);
    const tableCrop = createScaledCanvas(bitmap, {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      allowUpscale: true
    }, 1550, 1950);
    const enhanced = createScaledCanvas(bitmap, {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      allowUpscale: true
    }, 1550, 1950, "grayscale(1) contrast(138%) brightness(106%)");
    const rotated = document.createElement("canvas");
    rotated.width = enhanced.width;
    rotated.height = enhanced.height;
    const rotatedContext = rotated.getContext("2d");
    rotatedContext.fillStyle = "#ffffff";
    rotatedContext.fillRect(0, 0, rotated.width, rotated.height);
    rotatedContext.translate(rotated.width, rotated.height);
    rotatedContext.rotate(Math.PI);
    rotatedContext.drawImage(enhanced, 0, 0);
    return [
      tableCrop.toDataURL("image/jpeg", 0.84),
      enhanced.toDataURL("image/jpeg", 0.84),
      rotated.toDataURL("image/jpeg", 0.84)
    ];
  }

  function createRowsFromAiResult(result, geometry) {
    const firstDay = geometry.startDay;
    const lastDay = Math.min(
      firstDay + geometry.count - 1,
      daysInMonth(state.settings.month)
    );
    const groups = new Map();
    let unknownPunches = 0;

    (result.punches || []).forEach(punch => {
      const actualDay = Number(punch.day);
      const printedRow = Number(punch.printedRow);
      const hasActualDay = actualDay >= 1 && actualDay <= daysInMonth(state.settings.month);
      const hasPrintedRow = printedRow >= firstDay && printedRow <= lastDay;
      if (!hasActualDay && !hasPrintedRow) {
        unknownPunches += 1;
        return;
      }
      const day = hasActualDay ? actualDay : printedRow;
      const cropDay = hasPrintedRow
        ? printedRow
        : Math.max(firstDay, Math.min(lastDay, day));
      const groupKey = String(day);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          day,
          cropDay,
          cells: Array.from({ length: OCR_COLUMN_COUNT }, () => ({
            time: "",
            confidence: 0,
            hasInk: false
          })),
          notes: [],
          confidenceValues: [],
          dateUncertain: !hasActualDay
        });
      }
      const row = groups.get(groupKey);
      const column = Math.max(0, Math.min(OCR_COLUMN_COUNT - 1, Number(punch.column) || 0));
      const time = punch.readable && isValidAiTime(punch.time) ? punch.time : "";
      const confidence = Math.max(0, Math.min(100, Number(punch.confidence) || 0));
      const existing = row.cells[column];
      if (!existing.hasInk || confidence >= existing.confidence) {
        row.cells[column] = {
          time,
          confidence,
          hasInk: true
        };
      }
      if (punch.note) row.notes.push(punch.note);
      row.confidenceValues.push(confidence);
      if (!hasActualDay) row.dateUncertain = true;
    });

    const activeRows = [...groups.values()].map(row => {
      row.segments = [];
      for (let column = 0; column < OCR_COLUMN_COUNT; column += 2) {
        const start = row.cells[column];
        const end = row.cells[column + 1];
        if (start.time && end.time) row.segments.push({ start: start.time, end: end.time });
      }
      row.hasInk = row.cells.some(cell => cell.hasInk);
      row.hasPartial = row.cells.some((cell, index) => {
        const partner = row.cells[index % 2 === 0 ? index + 1 : index - 1];
        return cell.hasInk && !(cell.time && partner?.time);
      });
      row.confidence = row.confidenceValues.length
        ? row.confidenceValues.reduce((sum, value) => sum + value, 0) / row.confidenceValues.length
        : 0;
      row.aiNote = [...new Set(row.notes)].join("；");
      return row;
    });

    const activeDays = new Set(activeRows.map(row => row.day));
    const blankRows = [];
    for (let day = firstDay; day <= lastDay; day += 1) {
      if (activeDays.has(day)) continue;
      blankRows.push({
        day,
        cropDay: day,
        cells: Array.from({ length: OCR_COLUMN_COUNT }, () => ({
          time: "",
          confidence: 0,
          hasInk: false
        })),
        segments: [],
        hasInk: false,
        hasPartial: false,
        confidence: 0,
        aiNote: "",
        dateUncertain: false
      });
    }

    return {
      rows: [...activeRows, ...blankRows].sort((a, b) => a.day - b.day),
      activeRows,
      unknownPunches
    };
  }

  async function requestAiTimecard(upload, images, accessToken) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 58_000);
    try {
      const response = await fetch("/api/recognize-timecard", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { "X-Timecard-Token": accessToken } : {})
        },
        body: JSON.stringify({
          images,
          month: state.settings.month,
          half: upload.half
        }),
        signal: controller.signal
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fallback = response.status === 404
          ? "找不到 AI 辨識服務；請確認網站是由 Netlify 部署。"
          : "雲端 AI 暫時無法完成辨識。";
        throw new Error(payload.message || fallback);
      }
      if (!payload.result?.punches) throw new Error("AI 沒有回傳可用的打卡資料。");
      return payload;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("AI 辨識等候逾時，請重試一次。");
      if (error instanceof TypeError) {
        throw new Error("無法連線 AI 辨識服務；請確認已使用 Netlify 網址開啟 APP。");
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function recognizeUpload(uploadId) {
    if (!requirePermission("attendance") || !requireUnlockedMonth()) return;
    const upload = runtimeUploads.find(item => item.id === uploadId);
    if (!upload) return;
    const accessToken = $("#ai-access-token").value.trim();
    if (!cloudUser && !accessToken) {
      toast("請先輸入 AI 辨識連線密碼。");
      $("#ai-access-token").focus();
      return;
    }
    if (accessToken) localStorage.setItem(AI_TOKEN_STORAGE_KEY, accessToken);

    let bitmap = null;
    upload.status = "processing";
    upload.statusText = "雲端 AI 辨識中";
    renderUploads();

    try {
      setOcrPhase("準備正向、點陣強化與倒置日期三視圖", 5, 30);
      bitmap = await createImageBitmap(upload.file, { imageOrientation: "from-image" });
      const images = prepareAiImages(bitmap);

      setOcrPhase("AI 正在先找印章，再分開讀取日期與時間", 38, 52);
      const response = await requestAiTimecard(upload, images, accessToken);
      const result = response.result;
      if (result.cardHalf === "first" || result.cardHalf === "second") {
        upload.half = result.cardHalf;
      }

      setOcrPhase("整理辨識結果與核對圖片", 92, 8);
      const geometry = findGridGeometry([], upload.half, bitmap.width, bitmap.height);
      const sheet = buildNormalizedTimeSheet(bitmap, geometry);
      setUploadOcrPreview(upload, createLabeledOcrPreview(sheet));
      const aiRows = createRowsFromAiResult(result, geometry);
      upload.reviewRows = buildUploadReviewRows(sheet, aiRows.rows);
      upload.aiRequestId = response.requestId || "";
      let recognizedCount = 0;
      let unreadableCount = 0;

      aiRows.activeRows.forEach(row => {
        if (row.day < 1 || row.day > daysInMonth(state.settings.month)) return;
        const date = `${state.settings.month}-${String(row.day).padStart(2, "0")}`;
        const key = attendanceKey(upload.employeeId, date);
        if (state.attendance[key]?.status === "confirmed") return;
        const partialSegments = [];
        for (let column = 0; column < OCR_COLUMN_COUNT; column += 2) {
          const start = row.cells[column]?.time || "";
          const end = row.cells[column + 1]?.time || "";
          if (start || end) partialSegments.push({ start, end });
        }
        const hasCompleteSegment = row.segments.length > 0;
        state.attendance[key] = {
          employeeId: upload.employeeId,
          date,
          segments: hasCompleteSegment ? row.segments : partialSegments,
          status: hasCompleteSegment ? "review" : "unreadable",
          source: `AI：${upload.file.name}`,
          confidence: Math.round(row.confidence),
          note: [
            "雲端 AI 已用三視圖分別判讀倒置日期與正向時間，尚待人工確認。",
            row.dateUncertain ? "倒置日期不清楚，目前暫用最接近的表格列。" : "",
            row.hasPartial ? "至少一個印章或成對時間不完整。" : "",
            row.aiNote
          ].filter(Boolean).join(" ")
        };
        if (hasCompleteSegment) recognizedCount += 1;
        else unreadableCount += 1;
      });

      const punchCount = Array.isArray(result.punches) ? result.punches.length : 0;
      upload.status = "done";
      upload.statusText = `AI 找到 ${punchCount} 個印章・${recognizedCount} 日有完整時段・整體信心 ${result.overallConfidence || 0}%`;
      $("#attendance-employee").value = upload.employeeId;
      logAudit(
        "匯入 AI 打卡辨識",
        `${getEmployee(upload.employeeId)?.name || "員工"}・${upload.file.name}・${punchCount} 個印章`
      );
      saveState("AI 辨識結果已儲存");
      renderAll();
      showView("attendance");
      $("#ocr-progress-label").textContent = "AI 辨識完成";
      $("#ocr-progress-percent").textContent = "100%";
      $("#ocr-progress-bar").value = 100;
      const unknownText = aiRows.unknownPunches ? `；另有 ${aiRows.unknownPunches} 個印章日期與位置皆不清楚` : "";
      toast(punchCount
        ? `AI 找到 ${punchCount} 個印章${unknownText}，請逐項核對。`
        : "AI 未找到可讀取的印章，請使用放大圖人工核對。");
      if (upload.reviewRows.length) openOcrQuickReview(upload.id);
    } catch (error) {
      console.warn("Cloud AI recognition failed", error);
      upload.status = "error";
      upload.statusText = "AI 辨識失敗；可查看原圖或稍後重試";
      renderUploads();
      toast(error instanceof Error ? error.message : "AI 辨識無法完成，請稍後重試。");
    } finally {
      bitmap?.close();
      $("#ocr-progress").hidden = true;
    }
  }

  function downloadBlob(content, filename, type) {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const rows = payrollForMonth();
    const headers = ["月份", "員工", "薪制", "一般薪資", "加班費", "國定／颱風加給", "其他加給", "扣款", "實領"];
    const csvRows = [
      headers,
      ...rows.map(row => [
        state.settings.month,
        row.employee.name,
        row.employee.payType === "monthly" ? "月薪" : "時薪",
        row.regularPay,
        row.overtimePay,
        row.specialPay,
        row.earnings,
        row.deductions,
        row.total
      ])
    ];
    const csv = "\uFEFF" + csvRows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    downloadBlob(csv, `初一食午薪資_${state.settings.month}.csv`, "text/csv;charset=utf-8");
    state.closedMonths[state.settings.month] = {
      ...(state.closedMonths[state.settings.month] || {}),
      exportedAt: new Date().toISOString()
    };
    logAudit("匯出薪資資料", "CSV 薪資總表");
    saveState();
    renderAll();
    toast("CSV 已匯出");
  }

  function exportXlsx() {
    if (!window.XLSX) {
      exportCsv();
      toast("Excel 元件未載入，已改匯出 CSV。");
      return;
    }
    const payroll = payrollForMonth();
    const payrollRows = payroll.map(row => ({
      月份: state.settings.month,
      員工: row.employee.name,
      薪制: row.employee.payType === "monthly" ? "月薪制" : "時薪制",
      確認工作分鐘: row.regularMinutes,
      加班分鐘: row.overtimeMinutes,
      一般薪資: row.regularPay,
      加班費: row.overtimePay,
      國定假日及颱風加給: row.specialPay,
      其他加給: row.earnings,
      扣款: row.deductions,
      實領: row.total
    }));
    const attendanceRows = Object.values(state.attendance)
      .filter(record => record.date.startsWith(state.settings.month))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(record => ({
        日期: record.date,
        員工: getEmployee(record.employeeId)?.name || "",
        上下班時段: (record.segments || []).map(segment => `${segment.start || "?"}-${segment.end || "?"}`).join("、"),
        分鐘: recordMinutes(record),
        日別: getDayInfo(record.date).label,
        狀態: statusLabel(record.status),
        來源: record.source || "",
        備註: record.note || ""
      }));
    const adjustmentRows = state.adjustments
      .filter(adjustment => adjustmentApplies(adjustment, state.settings.month))
      .map(adjustment => ({
        員工: getEmployee(adjustment.employeeId)?.name || "",
        項目: adjustment.name,
        分類: adjustmentCategoryLabel(adjustment),
        類型: adjustment.type === "deduction" ? "扣款" : "加給",
        數量: adjustment.quantity || 1,
        單價: adjustment.unitRate || adjustment.amount,
        金額: adjustmentAmount(adjustment),
        生效月份: adjustment.effectiveFrom || adjustment.month,
        結束月份: adjustment.effectiveTo || "",
        週期: adjustment.recurring ? "持續生效" : "指定期間"
      }));

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(payrollRows), "薪資總表");
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(attendanceRows), "打卡明細");
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(adjustmentRows), "加給扣款");
    window.XLSX.writeFile(workbook, `初一食午薪資_${state.settings.month}.xlsx`);
    state.closedMonths[state.settings.month] = {
      ...(state.closedMonths[state.settings.month] || {}),
      exportedAt: new Date().toISOString()
    };
    logAudit("匯出薪資資料", "Excel 薪資總表、打卡明細與加給扣款");
    saveState();
    renderAll();
    toast("Excel 已匯出");
  }

  function installEventHandlers() {
    $$(".nav-item").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$(".mobile-bottom-nav [data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
    $$("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
    $(".mobile-menu").addEventListener("click", () => document.body.classList.toggle("menu-open"));

    $("#cloud-auth-button").addEventListener("click", () => {
      if (cloudUser) {
        showView("settings");
        return;
      }
      $("#cloud-login-error").hidden = true;
      $("#cloud-login-password").value = "";
      $("#cloud-auth-dialog").showModal();
      window.setTimeout(() => $("#cloud-login-email").focus(), 0);
    });
    $("#cloud-panel-login").addEventListener("click", () => $("#cloud-auth-button").click());
    $("#cloud-login-form").addEventListener("submit", async event => {
      event.preventDefault();
      const identity = window.PayrollIdentity;
      const submit = $("#cloud-login-submit");
      const errorElement = $("#cloud-login-error");
      errorElement.hidden = true;
      submit.disabled = true;
      submit.textContent = "登入中…";
      try {
        if (!identity) throw new Error("登入元件尚未載入，請重新整理網頁。");
        const user = await identity.login(
          $("#cloud-login-email").value.trim(),
          $("#cloud-login-password").value
        );
        $("#cloud-auth-dialog").close();
        await connectCloudUser(user);
        toast("管理者登入成功，已開始同步。");
      } catch (error) {
        errorElement.textContent = cloudErrorMessage(error);
        errorElement.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "登入並同步";
      }
    });
    $("#cloud-forgot-password").addEventListener("click", async () => {
      const email = $("#cloud-login-email").value.trim();
      const errorElement = $("#cloud-login-error");
      errorElement.hidden = true;
      if (!email) {
        errorElement.textContent = "請先輸入管理者 Email。";
        errorElement.hidden = false;
        $("#cloud-login-email").focus();
        return;
      }
      try {
        if (!window.PayrollIdentity) throw new Error("登入元件尚未載入，請重新整理網頁。");
        await window.PayrollIdentity.requestPasswordRecovery(email);
        $("#cloud-auth-dialog").close();
        toast("重設密碼信已寄出，請到信箱開啟連結。");
      } catch (error) {
        errorElement.textContent = cloudErrorMessage(error);
        errorElement.hidden = false;
      }
    });
    $("#cloud-password-form").addEventListener("submit", async event => {
      event.preventDefault();
      const password = $("#cloud-new-password").value;
      const confirmation = $("#cloud-confirm-password").value;
      const errorElement = $("#cloud-password-error");
      const submit = $("#cloud-password-submit");
      errorElement.hidden = true;
      if (password.length < 10) {
        errorElement.textContent = "密碼至少需要 10 個字元。";
        errorElement.hidden = false;
        return;
      }
      if (password !== confirmation) {
        errorElement.textContent = "兩次輸入的密碼不一致。";
        errorElement.hidden = false;
        return;
      }
      submit.disabled = true;
      submit.textContent = "設定中…";
      try {
        const identity = window.PayrollIdentity;
        if (!identity) throw new Error("登入元件尚未載入，請重新整理網頁。");
        let user;
        if (cloudCallbackMode === "invite" && cloudCallbackToken) {
          user = await identity.acceptInvite(cloudCallbackToken, password);
        } else if (cloudCallbackMode === "recovery") {
          user = await identity.updateUser({ password });
        } else {
          throw new Error("此密碼設定連結已失效，請重新開啟邀請信或重設密碼信。");
        }
        cloudCallbackMode = "";
        cloudCallbackToken = "";
        $("#cloud-password-dialog").close();
        await connectCloudUser(user);
        toast("密碼已設定，管理者帳號已登入。");
      } catch (error) {
        errorElement.textContent = cloudErrorMessage(error);
        errorElement.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = "儲存密碼並登入";
      }
    });
    $("#cloud-download-latest").addEventListener("click", async () => {
      if (!window.confirm("確定下載雲端最新資料？目前尚未同步的本機內容會先保留成安全備份，再由雲端版本取代。")) return;
      await pullCloudState({ notify: true }).catch(() => {});
    });
    $("#cloud-upload-current").addEventListener("click", async () => {
      if (!window.confirm("確定要用目前本機資料覆蓋雲端版本？雲端原版本會保留一份伺服器備份。")) return;
      await pushCloudState({ force: true, notify: true }).catch(() => {});
    });
    $("#cloud-download-local-backup").addEventListener("click", () => {
      const backup = localStorage.getItem(CLOUD_LOCAL_BACKUP_KEY);
      if (!backup) {
        toast("目前沒有同步前備份。");
        return;
      }
      downloadBlob(
        backup,
        `初一食午薪資_同步前備份_${new Date().toISOString().slice(0, 10)}.json`,
        "application/json"
      );
      toast("同步前本機備份已下載。");
    });
    $("#cloud-logout").addEventListener("click", async () => {
      window.clearTimeout(cloudSaveTimer);
      try {
        await window.PayrollIdentity?.logout();
      } catch (error) {
        console.warn("Cloud logout failed", error);
      }
      cloudUser = null;
      cloudRevision = "";
      cloudReady = false;
      cloudSaving = false;
      cloudSavePending = false;
      updateCloudUi();
      toast("已登出管理者帳號；本機資料仍保留。");
    });

    $("#access-role-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requirePermission("roles")) return;
      const email = $("#access-role-email").value.trim().toLowerCase();
      const role = $("#access-role-value").value;
      if (!email) return;
      state.settings.accessRoles[email] = role;
      logAudit("設定管理者角色", `${email}・${roleLabel(role)}`);
      event.target.reset();
      saveState();
      renderAll();
      toast("管理者角色已更新。");
    });
    $("#access-role-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-access-role");
      if (!button || !requirePermission("roles")) return;
      const email = button.dataset.email;
      const ownerCount = Object.values(state.settings.accessRoles).filter(role => role === "owner").length;
      if (state.settings.accessRoles[email] === "owner" && ownerCount <= 1) {
        toast("至少必須保留一位店主。");
        return;
      }
      delete state.settings.accessRoles[email];
      logAudit("移除管理者角色", email);
      saveState();
      renderAll();
    });

    $("#global-month").addEventListener("change", event => {
      state.settings.month = event.target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
    });
    $("#ai-access-token").addEventListener("change", event => {
      const value = event.target.value.trim();
      if (value) localStorage.setItem(AI_TOKEN_STORAGE_KEY, value);
      else localStorage.removeItem(AI_TOKEN_STORAGE_KEY);
      toast(value ? "AI 連線密碼已儲存在這台裝置。" : "已清除 AI 連線密碼。");
    });

    $("#attendance-employee").addEventListener("change", renderAttendance);
    $("#add-manual-record").addEventListener("click", () => openAttendanceDialog());
    $(".attendance-split").addEventListener("click", event => {
      const button = event.target.closest(".edit-attendance");
      if (button) openAttendanceDialog(button.dataset.date);
    });
    $("#attendance-card-list").addEventListener("click", event => {
      const button = event.target.closest(".edit-attendance");
      if (button) openAttendanceDialog(button.dataset.date);
    });

    $("#add-employee").addEventListener("click", () => openEmployeeDialog());
    $("#employee-grid").addEventListener("click", event => {
      const button = event.target.closest(".edit-employee");
      if (button) openEmployeeDialog(button.dataset.id);
    });
    $("#employee-pay-type").addEventListener("change", toggleEmployeeFields);
    $("#employee-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      const existingId = $("#employee-id").value;
      const id = existingId || uid("employee");
      const existing = existingId ? getEmployee(existingId) : null;
      const expectedWorkdays = $$('input[name="employee-workday"]:checked').map(input => Number(input.value));
      const weeklySchedule = Object.fromEntries($$("[data-workday]").map(row => {
        const day = Number(row.dataset.workday);
        const checked = $('input[name="employee-workday"]', row).checked;
        return [day, {
          expected: checked,
          start: $(".workday-start", row).value,
          end: $(".workday-end", row).value
        }];
      }));
      const effectiveFrom = $("#employee-rate-effective").value;
      const affectedLockedMonth = Object.entries(state.closedMonths)
        .find(([month, monthState]) => monthState?.locked && month >= effectiveFrom.slice(0, 7));
      if (affectedLockedMonth) {
        toast(`費率生效日會影響已鎖定的 ${monthLabel(affectedLockedMonth[0])}，請改用較晚的生效日。`);
        return;
      }
      const profile = {
        id: uid("rate"),
        effectiveFrom,
        payType: $("#employee-pay-type").value,
        hourlyRate: Number($("#employee-hourly-rate").value || 0),
        weekendRate: Number($("#employee-weekend-rate").value || 0),
        holidayRate: Number($("#employee-holiday-rate").value || 0),
        peakRate: Number($("#employee-peak-rate").value || 0),
        peakStart: $("#employee-peak-start").value,
        peakEnd: $("#employee-peak-end").value,
        monthlySalary: Number($("#employee-monthly-salary").value || 0),
        scheduleStart: $("#employee-schedule-start").value,
        scheduleEnd: $("#employee-schedule-end").value,
        expectedWorkdays,
        weeklySchedule
      };
      const history = [...(existing?.payHistory || [])];
      const sameDateIndex = history.findIndex(item => item.effectiveFrom === profile.effectiveFrom);
      if (sameDateIndex >= 0) history[sameDateIndex] = { ...history[sameDateIndex], ...profile };
      else history.push(profile);
      history.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      const pin = $("#employee-punch-pin").value.trim();
      const payload = normalizeEmployee({
        ...(existing || {}),
        ...profile,
        id,
        name: $("#employee-name").value.trim(),
        hireDate: $("#employee-hire-date").value,
        endDate: $("#employee-end-date").value,
        annualLeave: Number($("#employee-annual-leave").value || 0),
        active: $("#employee-active").checked,
        expectedWorkdays,
        weeklySchedule,
        payHistory: history,
        punchPinHash: pin ? await hashPunchPin(id, pin) : existing?.punchPinHash || ""
      });
      if (!payload.name) return;
      const index = state.employees.findIndex(employee => employee.id === existingId);
      if (index >= 0) state.employees[index] = payload;
      else state.employees.push(payload);
      logAudit(index >= 0 ? "新增／更新費率歷史" : "新增員工", `${payload.name}・${profile.effectiveFrom} 生效`);
      saveState();
      $("#employee-dialog").close();
      renderAll();
      toast("員工設定已儲存");
    });

    $("#leave-ledger-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requirePermission("payroll")) return;
      const entry = {
        id: uid("leave-ledger"),
        employeeId: $("#leave-ledger-employee").value,
        date: $("#leave-ledger-date").value,
        days: Number($("#leave-ledger-days").value || 0),
        note: $("#leave-ledger-note").value.trim(),
        actor: cloudUser?.email || "本機使用者",
        createdAt: new Date().toISOString()
      };
      if (!entry.date || !entry.days || !entry.note) return;
      state.leaveLedger.push(entry);
      logAudit("調整年假帳本", `${getEmployee(entry.employeeId)?.name || "員工"}・${entry.days > 0 ? "+" : ""}${entry.days} 天・${entry.note}`, entry.date.slice(0, 7));
      event.target.reset();
      $("#leave-ledger-date").value = new Date().toISOString().slice(0, 10);
      saveState();
      renderAll();
      toast("年假帳本已更新。");
    });

    $("#punch-clock-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (!requirePermission("attendance")) return;
      const employee = getEmployee($("#punch-clock-employee").value);
      const pin = $("#punch-clock-pin").value.trim();
      if (!employee?.punchPinHash) {
        toast("這位員工尚未設定打卡 PIN。");
        return;
      }
      if (await hashPunchPin(employee.id, pin) !== employee.punchPinHash) {
        toast("打卡 PIN 不正確。");
        return;
      }
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const month = date.slice(0, 7);
      if (isMonthLocked(month)) {
        toast("今天所在月份已鎖定，無法打卡。");
        return;
      }
      const key = attendanceKey(employee.id, date);
      const existing = state.attendance[key] || {
        employeeId: employee.id,
        date,
        segments: [],
        source: "店內 PIN 打卡",
        confidence: 100,
        note: ""
      };
      const segments = [...(existing.segments || [])];
      const open = segments.findLast(segment => segment.start && !segment.end);
      let action;
      if (open) {
        open.end = time;
        existing.status = "confirmed";
        action = "下班";
      } else {
        segments.push({ start: time, end: "" });
        existing.status = "review";
        action = "上班";
      }
      existing.segments = segments;
      state.attendance[key] = existing;
      state.settings.month = month;
      logAudit(`PIN ${action}打卡`, `${employee.name}・${date} ${time}`, month);
      $("#punch-clock-pin").value = "";
      $("#punch-clock-result").textContent = `${employee.name} 已於 ${time} 完成${action}打卡。`;
      saveState();
      renderAll();
      toast(`${employee.name} ${action}打卡成功。`);
    });

    $("#add-segment").addEventListener("click", () => {
      const segments = $$(".segment-row").map(row => ({
        start: $(".segment-start", row).value,
        end: $(".segment-end", row).value
      }));
      segments.push({ start: "", end: "" });
      renderSegmentInputs(segments);
    });
    $("#segment-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-segment");
      if (!button) return;
      const rows = $$(".segment-row");
      if (rows.length === 1) {
        $(".segment-start", rows[0]).value = "";
        $(".segment-end", rows[0]).value = "";
      } else {
        button.closest(".segment-row").remove();
      }
    });
    $("#attendance-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requirePermission("attendance") || !requireUnlockedMonth()) return;
      const shouldAdvance = saveAndAdvanceAttendance;
      saveAndAdvanceAttendance = false;
      const date = $("#attendance-date").value;
      const key = attendanceKey(attendanceDialogEmployeeId, date);
      if (attendanceDialogOriginalDate && attendanceDialogOriginalDate !== date) {
        const originalKey = attendanceKey(attendanceDialogEmployeeId, attendanceDialogOriginalDate);
        delete state.attendance[originalKey];
        delete state.leaveRecords[originalKey];
        delete state.shiftOverrides[originalKey];
      }
      const segments = $$(".segment-row").map(row => ({
        start: $(".segment-start", row).value,
        end: $(".segment-end", row).value
      })).filter(segment => segment.start || segment.end);
      const status = $("#attendance-status").value;
      if (status === "confirmed" && segments.some(segment => !segment.start || !segment.end)) {
        toast("已確認的紀錄必須有完整上班與下班時間。");
        return;
      }
      if (segments.length || status === "unreadable") {
        state.attendance[key] = {
          employeeId: attendanceDialogEmployeeId,
          date,
          segments,
          status,
          source: state.attendance[key]?.source || "人工輸入",
          confidence: status === "confirmed" ? 100 : state.attendance[key]?.confidence || 0,
          note: $("#attendance-note").value.trim()
        };
      } else {
        delete state.attendance[key];
      }
      const leaveType = $("#attendance-leave-type").value;
      if (leaveType) {
        state.leaveRecords[key] = {
          employeeId: attendanceDialogEmployeeId,
          date,
          type: leaveType,
          days: Number($("#attendance-leave-days").value || 1),
          note: $("#attendance-note").value.trim()
        };
      } else {
        delete state.leaveRecords[key];
      }
      const shiftStart = $("#attendance-shift-start").value;
      const shiftEnd = $("#attendance-shift-end").value;
      if (shiftStart || shiftEnd) {
        state.shiftOverrides[key] = { start: shiftStart, end: shiftEnd, expected: true };
      } else {
        delete state.shiftOverrides[key];
      }
      logAudit(
        status === "confirmed" ? "確認打卡紀錄" : "更新打卡紀錄",
        `${getEmployee(attendanceDialogEmployeeId)?.name || "員工"}・${date}・${statusLabel(status)}`
      );
      saveState();
      $("#attendance-dialog").close();
      renderAll();
      if (shouldAdvance) {
        const issues = getMonthAttendance(attendanceDialogEmployeeId, state.settings.month)
          .filter(record => record.status !== "confirmed")
          .sort((a, b) => a.date.localeCompare(b.date));
        const next = issues.find(record => record.date > date) || issues[0];
        if (next) {
          openAttendanceDialog(next.date);
          toast("已儲存，接著核對下一筆。");
        } else {
          toast("打卡紀錄已儲存；這位員工已無待確認項目。");
        }
      } else {
        toast("打卡紀錄已儲存");
      }
    });
    $("#save-next-attendance").addEventListener("click", () => {
      saveAndAdvanceAttendance = true;
      $("#attendance-form").requestSubmit();
    });
    $("#attendance-source-preview").addEventListener("click", event => {
      const button = event.target.closest("[data-preview-upload]");
      if (!button) return;
      const upload = runtimeUploads.find(item => item.id === button.dataset.previewUpload);
      if (upload) window.open(upload.url, "_blank", "noopener");
    });
    $("#delete-attendance").addEventListener("click", () => {
      if (!requirePermission("attendance") || !requireUnlockedMonth()) return;
      const date = $("#attendance-date").value;
      const key = attendanceKey(attendanceDialogEmployeeId, date);
      delete state.attendance[key];
      delete state.leaveRecords[key];
      delete state.shiftOverrides[key];
      logAudit("刪除打卡紀錄", `${getEmployee(attendanceDialogEmployeeId)?.name || "員工"}・${date}`);
      saveState();
      $("#attendance-dialog").close();
      renderAll();
      toast("紀錄已刪除");
    });

    $$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));

    $("#adjustment-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      const employeeId = $("#adjustment-employee").value;
      const adjustmentName = $("#adjustment-name").value.trim();
      const category = $("#adjustment-category").value;
      state.adjustments.push({
        id: uid("adjustment"),
        employeeId,
        name: adjustmentName,
        type: category === "deduction" ? "deduction" : "earning",
        category,
        quantity: Number($("#adjustment-quantity").value || 1),
        unitRate: Number($("#adjustment-unit-rate").value || 0),
        amount: Number($("#adjustment-quantity").value || 1) * Number($("#adjustment-unit-rate").value || 0),
        effectiveFrom: $("#adjustment-effective-from").value || state.settings.month,
        effectiveTo: $("#adjustment-effective-to").value,
        recurring: $("#adjustment-recurring").checked,
        month: $("#adjustment-recurring").checked ? "" : state.settings.month
      });
      logAudit("新增薪資項目", `${getEmployee(employeeId)?.name || "員工"}・${adjustmentName}`);
      event.target.reset();
      $("#adjustment-quantity").value = 1;
      $("#adjustment-effective-from").value = state.settings.month;
      saveState();
      renderAll();
      toast("薪資項目已加入");
    });
    $("#adjustment-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-adjustment");
      if (!button) return;
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      const removed = state.adjustments.find(adjustment => adjustment.id === button.dataset.id);
      state.adjustments = state.adjustments.filter(adjustment => adjustment.id !== button.dataset.id);
      if (removed) logAudit("移除薪資項目", `${getEmployee(removed.employeeId)?.name || "員工"}・${removed.name}`);
      saveState();
      renderAll();
      toast("薪資項目已移除");
    });

    $("#rules-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      state.settings.nationalMultiplier = Number($("#national-multiplier").value || 2);
      state.settings.typhoonMultiplier = Number($("#typhoon-multiplier").value || 1.5);
      state.settings.roundingMode = $("#rounding-mode").value;
      state.settings.monthlyRestQuota = Number($("#monthly-rest-quota").value || 7);
      state.settings.sickPayRatio = Number($("#sick-pay-ratio").value ?? 0.5);
      state.settings.ruleYear = Number($("#rule-year").value || 2026);
      state.settings.minimumHourlyWage = Number($("#minimum-hourly-wage").value || MINIMUM_HOURLY_WAGE_2026);
      state.settings.minimumMonthlyWage = Number($("#minimum-monthly-wage").value || MINIMUM_MONTHLY_WAGE_2026);
      logAudit("更新薪資規則", `國定假日 ${state.settings.nationalMultiplier} 倍・颱風日 ${state.settings.typhoonMultiplier} 倍`);
      saveState();
      renderAll();
      toast("薪資規則已儲存");
    });
    $("#special-day-form").addEventListener("submit", event => {
      event.preventDefault();
      const date = $("#special-day-date").value;
      const label = $("#special-day-label").value.trim();
      const type = $("#special-day-type").value;
      if (!date || !label) return;
      if (!requirePermission("payroll") || !requireUnlockedMonth(date.slice(0, 7))) return;
      state.specialDays.push({ id: uid("special-day"), date, label, type, official: false });
      logAudit("新增特殊日", `${date}・${label}`, date.slice(0, 7));
      event.target.reset();
      saveState();
      renderAll();
      toast("特殊日已新增");
    });
    $("#special-day-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-special-day");
      if (!button) return;
      const day = state.specialDays.find(item => item.id === button.dataset.id);
      if (!requirePermission("payroll") || (day && !requireUnlockedMonth(day.date.slice(0, 7)))) return;
      state.specialDays = state.specialDays.filter(day => day.id !== button.dataset.id);
      if (day) logAudit("移除特殊日", `${day.date}・${day.label}`, day.date.slice(0, 7));
      saveState();
      renderAll();
      toast("特殊日已移除");
    });

    const fileInput = $("#card-files");
    const csvFileInput = $("#attendance-csv-file");
    $("#import-attendance-csv").addEventListener("click", () => {
      if (requirePermission("attendance")) csvFileInput.click();
    });
    csvFileInput.addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        await importAttendanceCsv(file);
      } catch (error) {
        toast(error instanceof Error ? error.message : "CSV 匯入失敗。");
      } finally {
        event.target.value = "";
      }
    });
    $("#drop-zone").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", event => {
      addUploadFiles(event.target.files);
      event.target.value = "";
    });
    ["dragenter", "dragover"].forEach(type => $("#drop-zone").addEventListener(type, event => {
      event.preventDefault();
      $("#drop-zone").classList.add("is-dragging");
    }));
    ["dragleave", "drop"].forEach(type => $("#drop-zone").addEventListener(type, event => {
      event.preventDefault();
      $("#drop-zone").classList.remove("is-dragging");
    }));
    $("#drop-zone").addEventListener("drop", event => addUploadFiles(event.dataTransfer.files));
    $("#upload-list").addEventListener("click", event => {
      const button = event.target.closest("[data-upload-action]");
      if (!button) return;
      const upload = runtimeUploads.find(item => item.id === button.dataset.id);
      if (!upload) return;
      if (button.dataset.uploadAction === "recognize") recognizeUpload(upload.id);
      if (button.dataset.uploadAction === "quick-review") openOcrQuickReview(upload.id);
      if (button.dataset.uploadAction === "view") window.open(upload.url, "_blank", "noopener");
      if (button.dataset.uploadAction === "view-ocr" && upload.ocrPreviewUrl) {
        window.open(upload.ocrPreviewUrl, "_blank", "noopener");
      }
      if (button.dataset.uploadAction === "remove") {
        URL.revokeObjectURL(upload.url);
        if (upload.ocrPreviewUrl) URL.revokeObjectURL(upload.ocrPreviewUrl);
        runtimeUploads = runtimeUploads.filter(item => item.id !== upload.id);
        renderUploads();
      }
    });
    $("#save-ocr-review").addEventListener("click", saveOcrQuickReview);
    $("#ocr-review-list").addEventListener("input", event => {
      if (!event.target.classList.contains("ocr-review-day")) return;
      const row = event.target.closest(".ocr-review-row");
      const day = Number(event.target.value);
      const weekday = $(".ocr-review-weekday", row);
      if (day >= 1 && day <= daysInMonth(state.settings.month)) {
        const date = `${state.settings.month}-${String(day).padStart(2, "0")}`;
        weekday.textContent = `星期${weekdayLabel(date)}`;
        row.classList.remove("has-error");
      } else {
        weekday.textContent = "日期超出範圍";
        row.classList.add("has-error");
      }
    });

    $("#payroll-body").addEventListener("click", event => {
      const button = event.target.closest(".view-payslip");
      if (button) openPayslip(button.dataset.employeeId);
    });
    $("#download-statement-jpg").addEventListener("click", downloadStatementJpg);
    $("#create-employee-share").addEventListener("click", createEmployeeShare);
    $("#refresh-share-status").addEventListener("click", refreshEmployeeShareStatuses);
    $("#monthly-sales").addEventListener("change", event => {
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      state.settings.monthlySales[state.settings.month] = Number(event.target.value || 0);
      logAudit("更新本月營業額", money(event.target.value));
      saveState();
      renderAll();
    });
    $("#submit-payroll-review").addEventListener("click", () => {
      if (!requirePermission("payroll") || !requireUnlockedMonth()) return;
      const overrideReason = requestCloseOverride("提交覆核");
      if (overrideReason === null) return;
      const month = state.settings.month;
      state.closedMonths[month] = {
        ...(state.closedMonths[month] || {}),
        workflowStatus: "review",
        reviewedAt: new Date().toISOString(),
        reviewedBy: cloudUser?.email || "本機使用者",
        overrideReason
      };
      logAudit("提交薪資覆核", overrideReason || "所有異常均已完成");
      saveState();
      renderAll();
      toast("本月薪資已提交覆核。");
    });
    $("#approve-payroll").addEventListener("click", () => {
      if (!requirePermission("approve") || !requireUnlockedMonth()) return;
      const overrideReason = requestCloseOverride("核准薪資");
      if (overrideReason === null) return;
      const month = state.settings.month;
      const current = state.closedMonths[month] || {};
      state.closedMonths[month] = {
        ...current,
        locked: true,
        lockedAt: new Date().toISOString(),
        workflowStatus: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: cloudUser?.email || "本機使用者",
        overrideReason: overrideReason || current.overrideReason || "",
        snapshot: {
          createdAt: new Date().toISOString(),
          rows: calculateLivePayroll(month)
        }
      };
      logAudit("核准並鎖定薪資", overrideReason || "所有異常均已完成");
      saveState();
      renderAll();
      toast("薪資已核准並建立不可變更快照。");
    });
    $("#mark-payroll-paid").addEventListener("click", () => {
      if (!requirePermission("approve")) return;
      const month = state.settings.month;
      const current = state.closedMonths[month] || {};
      if (!current.locked || current.workflowStatus !== "approved") return;
      state.closedMonths[month] = {
        ...current,
        workflowStatus: "paid",
        paidAt: new Date().toISOString(),
        paidBy: cloudUser?.email || "本機使用者"
      };
      logAudit("標記薪資已發放", monthLabel(month));
      saveState();
      renderAll();
      toast("本月薪資已標記為已發薪。");
    });
    $("#toggle-month-lock").addEventListener("click", () => {
      if (!requirePermission("approve")) return;
      const month = state.settings.month;
      const current = state.closedMonths[month] || {};
      if (!current.locked) {
        const overrideReason = requestCloseOverride("鎖定月份");
        if (overrideReason === null) return;
        state.closedMonths[month] = {
          ...current,
          locked: true,
          lockedAt: new Date().toISOString(),
          workflowStatus: current.workflowStatus === "paid" ? "paid" : "approved",
          overrideReason,
          snapshot: { createdAt: new Date().toISOString(), rows: calculateLivePayroll(month) }
        };
        logAudit("鎖定月份並建立快照", overrideReason || `${monthLabel(month)}停止修改`);
        toast("本月已鎖定，歷史薪資不會再隨費率變動。");
      } else {
        const reason = window.prompt("解除已核准月份會重新開放修改，請輸入原因：", "");
        if (!reason?.trim()) return;
        state.closedMonths[month] = {
          ...current,
          locked: false,
          workflowStatus: "draft",
          unlockedAt: new Date().toISOString(),
          unlockedBy: cloudUser?.email || "本機使用者",
          unlockReason: reason.trim()
        };
        logAudit("解除月份鎖定", `${monthLabel(month)}・${reason.trim()}`);
        toast("已解除鎖定。");
      }
      saveState();
      renderAll();
    });
    $("#export-csv").addEventListener("click", exportCsv);
    $("#export-xlsx").addEventListener("click", exportXlsx);

    $("#download-backup").addEventListener("click", () => {
      downloadBlob(JSON.stringify(state, null, 2), `初一食午薪資備份_${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      toast("備份已下載");
    });
    $("#restore-backup").addEventListener("click", () => {
      if (requirePermission("backup")) $("#backup-file").click();
    });
    $("#backup-file").addEventListener("change", async event => {
      if (!requirePermission("backup")) {
        event.target.value = "";
        return;
      }
      const file = event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed.employees || !parsed.settings) throw new Error("INVALID_BACKUP");
        state = normalizeState(parsed);
        saveState();
        renderAll();
        toast("備份已還原");
      } catch {
        toast("這不是有效的薪資備份檔。");
      } finally {
        event.target.value = "";
      }
    });
    $("#reset-data").addEventListener("click", () => {
      if (!requirePermission("backup")) return;
      if (!window.confirm("確定恢復示範資料？目前瀏覽器中的薪資與打卡資料會被覆蓋。")) return;
      state = normalizeState(createDefaultState());
      saveState();
      renderAll();
      toast("已恢復示範資料");
    });
  }

  function init() {
    installEventHandlers();
    $("#ai-access-token").value = localStorage.getItem(AI_TOKEN_STORAGE_KEY) || "";
    $("#leave-ledger-date").value = new Date().toISOString().slice(0, 10);
    const updateClock = () => {
      const now = new Date();
      $("#punch-clock-now").textContent = new Intl.DateTimeFormat("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(now);
    };
    updateClock();
    window.setInterval(updateClock, 1000);
    renderAll();
    updateCloudUi();
    initializeCloudIdentity();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
