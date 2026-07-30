(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-payroll-v1";
  const AI_TOKEN_STORAGE_KEY = "breakfast-payroll-ai-token";
  const APP_VERSION = 1;
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
        roundingMode: "final"
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
        { id: "adj-lin-senior-bakery", employeeId: "lin-chen", name: "資深麵包台獎金", amount: 3000, type: "earning", recurring: true, month: "" },
        { id: "adj-lin-base", employeeId: "lin-chen", name: "底薪加給", amount: 1000, type: "earning", recurring: true, month: "" },
        { id: "adj-huang-senior", employeeId: "huang", name: "資深員工獎金", amount: 2000, type: "earning", recurring: true, month: "" },
        { id: "adj-jun-kitchen", employeeId: "lin-jun", name: "內場工作加給", amount: 2000, type: "earning", recurring: true, month: "" },
        { id: "adj-jun-base", employeeId: "lin-jun", name: "底薪加給", amount: 1000, type: "earning", recurring: true, month: "" },
        { id: "adj-he-insurance", employeeId: "he", name: "勞保／健保員工自負額", amount: 872, type: "deduction", recurring: true, month: "" }
      ],
      specialDays: OFFICIAL_DAYS_2026,
      closedMonths: {},
      auditLog: []
    };
  }

  function loadState() {
    const defaults = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const saved = JSON.parse(raw);
      return {
        ...defaults,
        ...saved,
        settings: { ...defaults.settings, ...(saved.settings || {}) },
        employees: Array.isArray(saved.employees) ? saved.employees : defaults.employees,
        attendance: saved.attendance || {},
        leaveRecords: saved.leaveRecords || {},
        adjustments: Array.isArray(saved.adjustments) ? saved.adjustments : defaults.adjustments,
        specialDays: Array.isArray(saved.specialDays) ? saved.specialDays : defaults.specialDays,
        closedMonths: saved.closedMonths || {},
        auditLog: Array.isArray(saved.auditLog) ? saved.auditLog : []
      };
    } catch (error) {
      console.warn("Unable to load saved payroll data", error);
      return defaults;
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

  function saveState(message = "已儲存於本機") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const indicator = $("#save-state");
    if (indicator) {
      indicator.textContent = message;
      window.setTimeout(() => { indicator.textContent = "已儲存於本機"; }, 1200);
    }
  }

  function uid(prefix = "id") {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function isMonthLocked(month = state.settings.month) {
    return Boolean(state.closedMonths?.[month]?.locked);
  }

  function logAudit(action, detail = "", month = state.settings.month) {
    state.auditLog.unshift({
      id: uid("audit"),
      month,
      action,
      detail,
      actor: "本機使用者",
      timestamp: new Date().toISOString()
    });
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
    const minutes = recordMinutes(record);
    if (!minutes) return 0;
    const day = getDayInfo(record.date);

    if (employee.payType === "hourly") {
      let rate = Number(employee.hourlyRate) || 0;
      if (day.type === "weekend") rate = Number(employee.weekendRate) || rate;
      if (day.type === "national") rate = Number(employee.holidayRate) || rate;
      let multiplier = 1;
      if (day.type === "national") multiplier = Number(state.settings.nationalMultiplier) || 1;
      if (day.type === "typhoon") multiplier = Number(state.settings.typhoonMultiplier) || 1;
      return applyRounding(minutes / 60 * rate * multiplier, state.settings.roundingMode, "item");
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
    const leaves = getMonthLeaves(employee.id, month);
    const restDays = leaves
      .filter(leave => leave.type === "monthly_rest")
      .reduce((sum, leave) => sum + Number(leave.days || 1), 0);
    const recordedAnnualDays = leaves
      .filter(leave => leave.type === "annual_leave")
      .reduce((sum, leave) => sum + Number(leave.days || 1), 0);
    const convertedAnnualDays = Math.max(0, restDays - 7);
    const annualUsed = recordedAnnualDays + convertedAnnualDays;
    return {
      restDays,
      recordedAnnualDays,
      convertedAnnualDays,
      annualUsed,
      annualRemaining: Number(employee.annualLeave || 0) - annualUsed
    };
  }

  function applyRounding(value, mode, stage = "item") {
    if (mode === "item" && stage === "item") return Math.round(value);
    if (mode === "final" && stage === "final") return Math.round(value);
    if (mode === "none") return Math.round(value * 100) / 100;
    return value;
  }

  function dailyEarlyOvertime(employee, record) {
    if (!employee.scheduleStart || record.status !== "confirmed") return 0;
    const scheduledStart = timeToMinutes(employee.scheduleStart);
    if (scheduledStart === null) return 0;
    return (record.segments || []).reduce((sum, segment) => {
      const start = timeToMinutes(segment.start);
      if (start === null || start >= scheduledStart) return sum;
      return sum + (scheduledStart - start);
    }, 0);
  }

  function calculatePayroll(employee, month) {
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
        let rate = Number(employee.hourlyRate) || 0;
        if (day.type === "weekend") rate = Number(employee.weekendRate) || rate;
        if (day.type === "national") rate = Number(employee.holidayRate) || rate;
        const dailyRegular = minutes / 60 * rate;
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
        const earlyMinutes = dailyEarlyOvertime(employee, record);
        if (earlyMinutes > 0) {
          const firstBand = Math.min(120, earlyMinutes);
          const secondBand = Math.min(120, Math.max(0, earlyMinutes - 120));
          const beyond = Math.max(0, earlyMinutes - 240);
          const dailyOvertime =
            firstBand / 60 * hourlyBase * (4 / 3) +
            secondBand / 60 * hourlyBase * (5 / 3) +
            beyond / 60 * hourlyBase * 2;
          overtimePay += dailyOvertime;
          overtimeMinutes += earlyMinutes;
          detailLines.push({
            label: `${record.date.slice(5)} 提早上班 ${earlyMinutes} 分鐘`,
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
      adjustment.employeeId === employee.id && (adjustment.recurring || adjustment.month === month)
    );
    const earnings = applicableAdjustments
      .filter(adjustment => adjustment.type === "earning")
      .reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);
    let deductions = applicableAdjustments
      .filter(adjustment => adjustment.type === "deduction")
      .reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);

    applicableAdjustments.forEach(adjustment => {
      detailLines.push({
        label: `${adjustment.type === "deduction" ? "扣款" : "加給"}・${adjustment.name}`,
        amount: adjustment.type === "deduction" ? -Number(adjustment.amount) : Number(adjustment.amount)
      });
    });

    if (employee.payType === "monthly") {
      const unpaidDays = leaves.filter(leave => leave.type === "unpaid").reduce((sum, leave) => sum + Number(leave.days || 1), 0);
      if (unpaidDays > 0) {
        const unpaidDeduction = Number(employee.monthlySalary || 0) / 30 * unpaidDays;
        deductions += unpaidDeduction;
        detailLines.push({ label: `事假／無薪假 ${unpaidDays} 天`, amount: -applyRounding(unpaidDeduction, mode, "item") });
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
      leaves,
      leaveSummary
    };
  }

  function payrollForMonth(month = state.settings.month) {
    return state.employees
      .filter(employee => employee.active)
      .map(employee => calculatePayroll(employee, month));
  }

  function currentIssues() {
    const month = state.settings.month;
    const attendanceIssues = Object.values(state.attendance)
      .filter(record => record.date.startsWith(month) && record.status !== "confirmed");
    const employeeWarnings = [];

    state.employees.filter(employee => employee.active).forEach(employee => {
      const leaveSummary = employeeLeaveSummary(employee, month);
      if (leaveSummary.annualRemaining < 0) {
        employeeWarnings.push({
          level: "danger",
          title: `${employee.name}年假不足`,
          text: `本月使用 ${decimal(leaveSummary.annualUsed, 1)} 天（含月休超過 7 日轉抵），超出可用餘額 ${decimal(Math.abs(leaveSummary.annualRemaining), 1)} 天。`
        });
      }
      if (employee.payType === "hourly" && Number(employee.hourlyRate) < MINIMUM_HOURLY_WAGE_2026) {
        employeeWarnings.push({ level: "danger", title: `${employee.name}時薪低於 2026 最低工資`, text: `目前設定 ${employee.hourlyRate} 元。` });
      }
      if (employee.payType === "monthly" && Number(employee.monthlySalary) < MINIMUM_MONTHLY_WAGE_2026) {
        employeeWarnings.push({ level: "danger", title: `${employee.name}月薪低於 2026 最低工資`, text: `目前設定 ${employee.monthlySalary} 元。` });
      }
    });

    return { attendanceIssues, employeeWarnings };
  }

  function populateEmployeeSelects() {
    const activeEmployees = state.employees.filter(employee => employee.active);
    const selectIds = ["upload-employee", "attendance-employee", "adjustment-employee"];
    selectIds.forEach(id => {
      const select = $(`#${id}`);
      if (!select) return;
      const current = select.value;
      select.innerHTML = activeEmployees.map(employee =>
        `<option value="${employee.id}">${escapeHtml(employee.name)}</option>`
      ).join("");
      if (activeEmployees.some(employee => employee.id === current)) select.value = current;
    });
  }

  function renderCloseProgress() {
    const month = state.settings.month;
    const records = Object.values(state.attendance).filter(record => record.date.startsWith(month));
    const issueCount = records.filter(record => record.status !== "confirmed").length;
    const monthState = state.closedMonths?.[month] || {};
    const steps = [
      { key: "upload", done: records.length > 0 },
      { key: "review", done: records.length > 0 && issueCount === 0 },
      { key: "calculate", done: records.length > 0 && issueCount === 0 },
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
        level: record.status === "unreadable" ? "danger" : "warning",
        title: `${getEmployee(record.employeeId)?.name || "員工"}・${record.date.slice(5)}`,
        text: record.status === "unreadable" ? "打卡時間無法判斷" : "OCR 結果等待人工確認"
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
    const employeeId = select.value || state.employees.find(employee => employee.active)?.id;
    if (!employeeId) return;
    select.value = employeeId;
    const month = state.settings.month;

    $("#attendance-body").innerHTML = dateRangeForMonth(month).map(date => {
      const key = attendanceKey(employeeId, date);
      const record = state.attendance[key];
      const leave = state.leaveRecords[key];
      const minutes = recordMinutes(record);
      const status = record?.status;
      return `
        <tr>
          <td><strong>${Number(date.slice(-2))}</strong>（${weekdayLabel(date)}）</td>
          <td>${dayTypeMarkup(date)}</td>
          <td>${formatSegments(record?.segments)}</td>
          <td class="number">${minutes ? decimal(minutes, 0) : "—"}</td>
          <td>${leave ? `<span class="status-pill status-review">${escapeHtml(leaveLabel(leave.type))}</span>` : "—"}</td>
          <td>${status ? `<span class="status-pill status-${status}">${statusLabel(status)}</span>` : '<span class="muted-text">無紀錄</span>'}</td>
          <td title="${escapeHtml(record?.source || "")}">${record?.source ? escapeHtml(record.source.slice(0, 16)) : "—"}</td>
          <td><button class="text-btn edit-attendance" type="button" data-date="${date}">編輯</button></td>
        </tr>
      `;
    }).join("");

    $("#attendance-card-list").innerHTML = dateRangeForMonth(month).map(date => {
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

  function renderPayroll() {
    const payroll = payrollForMonth();
    $("#payroll-body").innerHTML = payroll.map(row => `
      <tr>
        <td><strong>${escapeHtml(row.employee.name)}</strong></td>
        <td>${row.employee.payType === "monthly" ? "月薪制" : "時薪制"}</td>
        <td class="number">${money(row.regularPay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
        <td class="number">${money(row.overtimePay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
        <td class="number">${money(row.specialPay, state.settings.roundingMode === "none" ? 2 : 0)}</td>
        <td class="number">${money(row.earnings)}</td>
        <td class="number">${money(row.deductions)}</td>
        <td class="number"><strong>${money(row.total, state.settings.roundingMode === "none" ? 2 : 0)}</strong></td>
        <td><button class="text-btn view-payslip" type="button" data-employee-id="${row.employee.id}">9:16 出席明細</button></td>
      </tr>
    `).join("");

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
    renderAudit();
    const lockButton = $("#toggle-month-lock");
    lockButton.textContent = isMonthLocked() ? "解除本月鎖定" : "鎖定本月";
    lockButton.classList.toggle("is-locked", isMonthLocked());
  }

  function renderAdjustments() {
    const month = state.settings.month;
    const list = state.adjustments.filter(adjustment => adjustment.recurring || adjustment.month === month);
    $("#adjustment-list").innerHTML = list.length ? list.map(adjustment => {
      const employee = getEmployee(adjustment.employeeId);
      return `
        <span class="adjustment-tag ${adjustment.type === "deduction" ? "deduction" : ""}">
          ${escapeHtml(employee?.name || "已刪除員工")}・${escapeHtml(adjustment.name)}
          ${adjustment.type === "deduction" ? "−" : "+"}${money(adjustment.amount)}
          ${adjustment.recurring ? "／每月" : ""}
          <button type="button" class="remove-adjustment" data-id="${adjustment.id}" aria-label="刪除">×</button>
        </span>
      `;
    }).join("") : '<p class="empty-copy">本月沒有額外加給或扣款</p>';
  }

  function employeeRateMarkup(employee) {
    if (employee.payType === "monthly") {
      return `
        <div><span>固定月薪</span><strong>${money(employee.monthlySalary)}</strong></div>
        <div><span>固定班別</span><strong>${employee.scheduleStart ? `${employee.scheduleStart}－${employee.scheduleEnd || "未設定"}` : "未設定"}</strong></div>
        <div><span>平日時薪基礎</span><strong>${money(Number(employee.monthlySalary || 0) / 240, 2)}</strong></div>
        <div><span>年假餘額</span><strong>${decimal(employee.annualLeave, 1)} 天</strong></div>
      `;
    }
    return `
      <div><span>平日時薪</span><strong>${money(employee.hourlyRate)}</strong></div>
      <div><span>週末時薪</span><strong>${money(employee.weekendRate || employee.hourlyRate)}</strong></div>
      <div><span>國定假日基礎</span><strong>${money(employee.holidayRate || employee.hourlyRate)}</strong></div>
      <div><span>年假餘額</span><strong>${decimal(employee.annualLeave, 1)} 天</strong></div>
    `;
  }

  function renderEmployees() {
    $("#employee-grid").innerHTML = state.employees.map(employee => `
      <article class="employee-card ${employee.active ? "" : "is-inactive"}">
        <div class="employee-card-header">
          <span class="employee-avatar">${escapeHtml(employee.name.slice(0, 1))}</span>
          <span class="status-pill ${employee.active ? "status-confirmed" : "status-unreadable"}">${employee.active ? "在職" : "停用"}</span>
        </div>
        <h3>${escapeHtml(employee.name)}</h3>
        <p>${employee.payType === "monthly" ? "月薪制" : "時薪制"}${employee.hireDate ? `・${escapeHtml(employee.hireDate)} 到職` : "・到職日未設定"}</p>
        <div class="employee-rate-grid">${employeeRateMarkup(employee)}</div>
        <button class="text-btn edit-employee" type="button" data-id="${employee.id}">編輯</button>
      </article>
    `).join("");
  }

  function renderSettings() {
    $("#national-multiplier").value = state.settings.nationalMultiplier;
    $("#typhoon-multiplier").value = state.settings.typhoonMultiplier;
    $("#rounding-mode").value = state.settings.roundingMode;
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
  }

  function showView(name) {
    $$(".view").forEach(view => view.classList.toggle("is-active", view.id === `view-${name}`));
    $$(".nav-item").forEach(item => item.classList.toggle("is-active", item.dataset.view === name));
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
    if (!requireUnlockedMonth()) return;
    const employee = employeeId ? getEmployee(employeeId) : null;
    $("#employee-dialog-title").textContent = employee ? `編輯 ${employee.name}` : "新增員工";
    $("#employee-id").value = employee?.id || "";
    $("#employee-name").value = employee?.name || "";
    $("#employee-pay-type").value = employee?.payType || "hourly";
    $("#employee-hourly-rate").value = employee?.hourlyRate || 200;
    $("#employee-weekend-rate").value = employee?.weekendRate || employee?.hourlyRate || 200;
    $("#employee-holiday-rate").value = employee?.holidayRate || employee?.hourlyRate || 200;
    $("#employee-monthly-salary").value = employee?.monthlySalary || 0;
    $("#employee-schedule-start").value = employee?.scheduleStart || "08:00";
    $("#employee-schedule-end").value = employee?.scheduleEnd || "15:00";
    $("#employee-hire-date").value = employee?.hireDate || "";
    $("#employee-annual-leave").value = employee?.annualLeave || 0;
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
    if (!requireUnlockedMonth()) return;
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
    const row = calculatePayroll(employee, month);
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
      adjustment.employeeId === employee.id && (adjustment.recurring || adjustment.month === month)
    );
    const facts = employee.payType === "hourly"
      ? [
          ["平日時薪", money(employee.hourlyRate)],
          ["週末時薪", money(employee.weekendRate || employee.hourlyRate)],
          ["國定假日基礎", money(employee.holidayRate || employee.hourlyRate)],
          ["平日工作分鐘", `${groupedMinutes.weekday || 0} 分`],
          ["週末工作分鐘", `${groupedMinutes.weekend || 0} 分`],
          ["國定／颱風分鐘", `${(groupedMinutes.national || 0) + (groupedMinutes.typhoon || 0)} 分`]
        ]
      : [
          ["固定月薪", money(employee.monthlySalary)],
          ["固定班別", employee.scheduleStart ? `${employee.scheduleStart}－${employee.scheduleEnd || "未設定"}` : "未設定"],
          ["平日時薪基礎", money(Number(employee.monthlySalary || 0) / 240, 2)],
          ["本月月休", `${decimal(row.leaveSummary.restDays, 1)} 天`],
          ["轉抵／使用年假", `${decimal(row.leaveSummary.annualUsed, 1)} 天`],
          ["年假試算餘額", `${decimal(row.leaveSummary.annualRemaining, 1)} 天`]
        ];
    const calculationRows = [
      ["一般薪資", row.regularPay],
      ...(row.overtimePay ? [["提早上班加班費", row.overtimePay]] : []),
      ...(row.specialPay ? [["國定假日／颱風加給", row.specialPay]] : []),
      ...applicableAdjustments.map(adjustment => [
        `${adjustment.type === "deduction" ? "扣款" : "加給"}・${adjustment.name}`,
        adjustment.type === "deduction" ? -Number(adjustment.amount) : Number(adjustment.amount)
      ]),
      ...(!applicableAdjustments.length ? [["其他加給／扣款", 0]] : [])
    ];

    $("#payslip-title").textContent = `${employee.name}・${monthLabel(month)}出席與薪資明細`;
    $("#payslip-content").innerHTML = `
      <article class="employee-statement" data-employee-id="${escapeHtml(employee.id)}" data-employee-name="${escapeHtml(employee.name)}" data-month="${escapeHtml(month)}">
        <header class="statement-name">
          <strong>${escapeHtml(employee.name)}</strong>
          <span>${monthLabel(month)}・${employee.payType === "monthly" ? "月薪制" : "時薪制"}</span>
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
                ? (employee.payType === "monthly" && !dailyPay ? "月薪內" : money(dailyPay))
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
      reviewCanvas.width = 960;
      reviewCanvas.height = 180;
      const reviewContext = reviewCanvas.getContext("2d");
      reviewContext.fillStyle = "#f4f5f2";
      reviewContext.fillRect(0, 0, reviewCanvas.width, reviewCanvas.height);
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
        const reviewX = Math.max(0, cellLeft + columnWidth * 0.02);
        const reviewY = Math.max(0, boundary - geometry.spacing * 1.3);
        const reviewWidth = Math.max(1, Math.min(source.width - reviewX, columnWidth * 0.96));
        const reviewHeight = Math.max(1, Math.min(source.height - reviewY, geometry.spacing * 2.1));
        reviewContext.save();
        reviewContext.filter = "grayscale(1) contrast(190%)";
        reviewContext.drawImage(
          bitmap,
          reviewX,
          reviewY,
          reviewWidth,
          reviewHeight,
          column * 160,
          0,
          160,
          reviewCanvas.height
        );
        reviewContext.restore();
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
    const original = createScaledCanvas(bitmap, {
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height,
      allowUpscale: false
    }, 1700, 2100);
    const cropX = Math.round(bitmap.width * 0.1);
    const cropY = Math.round(bitmap.height * 0.28);
    const cropWidth = Math.round(bitmap.width * 0.7);
    const cropHeight = Math.round(bitmap.height * 0.62);
    const enhanced = createScaledCanvas(bitmap, {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
      allowUpscale: true
    }, 1700, 2100, "grayscale(1) contrast(175%) brightness(110%)");
    return [
      original.toDataURL("image/jpeg", 0.9),
      enhanced.toDataURL("image/jpeg", 0.9)
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
        headers: {
          "Content-Type": "application/json",
          "X-Timecard-Token": accessToken
        },
        body: JSON.stringify({
          images,
          employeeName: getEmployee(upload.employeeId)?.name || "",
          month: state.settings.month,
          half: upload.half,
          fileName: upload.file.name
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
    if (!requireUnlockedMonth()) return;
    const upload = runtimeUploads.find(item => item.id === uploadId);
    if (!upload) return;
    const accessToken = $("#ai-access-token").value.trim();
    if (!accessToken) {
      toast("請先輸入 AI 辨識連線密碼。");
      $("#ai-access-token").focus();
      return;
    }
    localStorage.setItem(AI_TOKEN_STORAGE_KEY, accessToken);

    let bitmap = null;
    upload.status = "processing";
    upload.statusText = "雲端 AI 辨識中";
    renderUploads();

    try {
      setOcrPhase("準備原圖與高對比副本", 5, 30);
      bitmap = await createImageBitmap(upload.file, { imageOrientation: "from-image" });
      const images = prepareAiImages(bitmap);

      setOcrPhase("AI 正在逐一讀取倒置日期與正向時間", 38, 52);
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
            "雲端 AI 已分別判讀倒置日期與正向時間，尚待人工確認。",
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
      .filter(adjustment => adjustment.recurring || adjustment.month === state.settings.month)
      .map(adjustment => ({
        員工: getEmployee(adjustment.employeeId)?.name || "",
        項目: adjustment.name,
        類型: adjustment.type === "deduction" ? "扣款" : "加給",
        金額: adjustment.amount,
        週期: adjustment.recurring ? "每月固定" : state.settings.month
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
    $$("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
    $(".mobile-menu").addEventListener("click", () => document.body.classList.toggle("menu-open"));

    $("#global-month").addEventListener("change", event => {
      state.settings.month = event.target.value;
      saveState();
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
    $("#attendance-body").addEventListener("click", event => {
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
    $("#employee-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requireUnlockedMonth()) return;
      const existingId = $("#employee-id").value;
      const payload = {
        id: existingId || uid("employee"),
        name: $("#employee-name").value.trim(),
        payType: $("#employee-pay-type").value,
        hourlyRate: Number($("#employee-hourly-rate").value || 0),
        weekendRate: Number($("#employee-weekend-rate").value || 0),
        holidayRate: Number($("#employee-holiday-rate").value || 0),
        monthlySalary: Number($("#employee-monthly-salary").value || 0),
        scheduleStart: $("#employee-schedule-start").value,
        scheduleEnd: $("#employee-schedule-end").value,
        hireDate: $("#employee-hire-date").value,
        annualLeave: Number($("#employee-annual-leave").value || 0),
        active: $("#employee-active").checked
      };
      if (!payload.name) return;
      const index = state.employees.findIndex(employee => employee.id === existingId);
      if (index >= 0) state.employees[index] = payload;
      else state.employees.push(payload);
      logAudit(index >= 0 ? "更新員工薪資設定" : "新增員工", payload.name);
      saveState();
      $("#employee-dialog").close();
      renderAll();
      toast("員工設定已儲存");
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
      if (!requireUnlockedMonth()) return;
      const shouldAdvance = saveAndAdvanceAttendance;
      saveAndAdvanceAttendance = false;
      const date = $("#attendance-date").value;
      const key = attendanceKey(attendanceDialogEmployeeId, date);
      if (attendanceDialogOriginalDate && attendanceDialogOriginalDate !== date) {
        const originalKey = attendanceKey(attendanceDialogEmployeeId, attendanceDialogOriginalDate);
        delete state.attendance[originalKey];
        delete state.leaveRecords[originalKey];
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
          days: 1,
          note: $("#attendance-note").value.trim()
        };
      } else {
        delete state.leaveRecords[key];
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
      if (!requireUnlockedMonth()) return;
      const date = $("#attendance-date").value;
      const key = attendanceKey(attendanceDialogEmployeeId, date);
      delete state.attendance[key];
      delete state.leaveRecords[key];
      logAudit("刪除打卡紀錄", `${getEmployee(attendanceDialogEmployeeId)?.name || "員工"}・${date}`);
      saveState();
      $("#attendance-dialog").close();
      renderAll();
      toast("紀錄已刪除");
    });

    $$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));

    $("#adjustment-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requireUnlockedMonth()) return;
      const employeeId = $("#adjustment-employee").value;
      const adjustmentName = $("#adjustment-name").value.trim();
      state.adjustments.push({
        id: uid("adjustment"),
        employeeId,
        name: adjustmentName,
        type: $("#adjustment-type").value,
        amount: Number($("#adjustment-amount").value || 0),
        recurring: $("#adjustment-recurring").checked,
        month: $("#adjustment-recurring").checked ? "" : state.settings.month
      });
      logAudit("新增薪資項目", `${getEmployee(employeeId)?.name || "員工"}・${adjustmentName}`);
      event.target.reset();
      saveState();
      renderAll();
      toast("薪資項目已加入");
    });
    $("#adjustment-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-adjustment");
      if (!button) return;
      if (!requireUnlockedMonth()) return;
      const removed = state.adjustments.find(adjustment => adjustment.id === button.dataset.id);
      state.adjustments = state.adjustments.filter(adjustment => adjustment.id !== button.dataset.id);
      if (removed) logAudit("移除薪資項目", `${getEmployee(removed.employeeId)?.name || "員工"}・${removed.name}`);
      saveState();
      renderAll();
      toast("薪資項目已移除");
    });

    $("#rules-form").addEventListener("submit", event => {
      event.preventDefault();
      if (!requireUnlockedMonth()) return;
      state.settings.nationalMultiplier = Number($("#national-multiplier").value || 2);
      state.settings.typhoonMultiplier = Number($("#typhoon-multiplier").value || 1.5);
      state.settings.roundingMode = $("#rounding-mode").value;
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
      if (!requireUnlockedMonth(date.slice(0, 7))) return;
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
      if (day && !requireUnlockedMonth(day.date.slice(0, 7))) return;
      state.specialDays = state.specialDays.filter(day => day.id !== button.dataset.id);
      if (day) logAudit("移除特殊日", `${day.date}・${day.label}`, day.date.slice(0, 7));
      saveState();
      renderAll();
      toast("特殊日已移除");
    });

    const fileInput = $("#card-files");
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
    $("#toggle-month-lock").addEventListener("click", () => {
      const month = state.settings.month;
      const current = state.closedMonths[month] || {};
      if (!current.locked) {
        const issueCount = currentIssues().attendanceIssues.length;
        if (issueCount && !window.confirm(`本月仍有 ${issueCount} 筆打卡待確認，仍要鎖定嗎？`)) return;
        state.closedMonths[month] = { ...current, locked: true, lockedAt: new Date().toISOString() };
        logAudit("鎖定月份", `${monthLabel(month)}停止修改`);
        toast("本月已鎖定，仍可查看與匯出。");
      } else {
        state.closedMonths[month] = { ...current, locked: false, unlockedAt: new Date().toISOString() };
        logAudit("解除月份鎖定", `${monthLabel(month)}可再次修改`);
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
    $("#restore-backup").addEventListener("click", () => $("#backup-file").click());
    $("#backup-file").addEventListener("change", async event => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed.employees || !parsed.settings) throw new Error("INVALID_BACKUP");
        state = { ...createDefaultState(), ...parsed, settings: { ...createDefaultState().settings, ...parsed.settings } };
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
      if (!window.confirm("確定恢復示範資料？目前瀏覽器中的薪資與打卡資料會被覆蓋。")) return;
      state = createDefaultState();
      saveState();
      renderAll();
      toast("已恢復示範資料");
    });
  }

  function init() {
    installEventHandlers();
    $("#ai-access-token").value = localStorage.getItem(AI_TOKEN_STORAGE_KEY) || "";
    renderAll();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
