(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-payroll-v1";
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
      specialDays: OFFICIAL_DAYS_2026
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
        specialDays: Array.isArray(saved.specialDays) ? saved.specialDays : defaults.specialDays
      };
    } catch (error) {
      console.warn("Unable to load saved payroll data", error);
      return defaults;
    }
  }

  let state = loadState();
  let runtimeUploads = [];
  let ocrWorker = null;
  let toastTimer = null;
  let attendanceDialogEmployeeId = "";
  let attendanceDialogOriginalDate = "";

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
      leaves
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
      const leaves = getMonthLeaves(employee.id, month);
      const restDays = leaves.filter(leave => leave.type === "monthly_rest").length;
      const annualDays = leaves.filter(leave => leave.type === "annual_leave").reduce((sum, leave) => sum + Number(leave.days || 1), 0);
      if (restDays > 7) {
        employeeWarnings.push({ level: "warning", title: `${employee.name}月休 ${restDays} 天`, text: "超過 7 天，尚未自動扣年假，請確認假別。" });
      }
      if (annualDays > Number(employee.annualLeave || 0)) {
        employeeWarnings.push({ level: "danger", title: `${employee.name}年假不足`, text: `已登記 ${annualDays} 天，餘額為 ${employee.annualLeave || 0} 天。` });
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
        <td><button class="text-btn view-payslip" type="button" data-employee-id="${row.employee.id}">明細</button></td>
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
          <button type="button" data-upload-action="recognize" data-id="${upload.id}">開始辨識</button>
          <button type="button" data-upload-action="view" data-id="${upload.id}">查看原圖</button>
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
    renderSegmentInputs(record?.segments?.length ? record.segments : [{ start: "", end: "" }]);
    $("#attendance-dialog").showModal();
  }

  function openPayslip(employeeId) {
    const row = calculatePayroll(getEmployee(employeeId), state.settings.month);
    $("#payslip-title").textContent = `${row.employee.name}・${monthLabel(state.settings.month)}薪資單`;
    $("#payslip-content").innerHTML = `
      <div class="payslip-summary">
        <div><span>薪制</span><strong>${row.employee.payType === "monthly" ? "月薪制" : "時薪制"}</strong></div>
        <div><span>確認工時</span><strong>${decimal((row.regularMinutes + row.overtimeMinutes) / 60, 2)} 小時</strong></div>
        <div><span>待確認</span><strong>${row.issues} 筆</strong></div>
      </div>
      <div class="payslip-lines">
        ${row.detailLines.map(line => `
          <div class="payslip-line"><span>${escapeHtml(line.label)}</span><strong>${line.amount < 0 ? "−" : ""}${money(Math.abs(line.amount), state.settings.roundingMode === "none" ? 2 : 0)}</strong></div>
        `).join("")}
        <div class="payslip-line total"><span>本月實領</span><strong>${money(row.total, state.settings.roundingMode === "none" ? 2 : 0)}</strong></div>
      </div>
    `;
    $("#payslip-dialog").showModal();
  }

  function addUploadFiles(files) {
    const employeeId = $("#upload-employee").value;
    const half = $("#upload-half").value;
    [...files].filter(file => file.type.startsWith("image/")).forEach(file => {
      runtimeUploads.push({
        id: uid("upload"),
        file,
        url: URL.createObjectURL(file),
        employeeId,
        half,
        status: "queued",
        statusText: "等待辨識"
      });
    });
    renderUploads();
  }

  function updateOcrProgress(progress) {
    const box = $("#ocr-progress");
    box.hidden = false;
    const pct = Math.round((progress.progress || 0) * 100);
    const labels = {
      "loading tesseract core": "載入辨識核心",
      "initializing tesseract": "初始化辨識",
      "loading language traineddata": "載入數字辨識資料",
      "initializing api": "準備辨識",
      "recognizing text": "正在辨識打卡時間"
    };
    $("#ocr-progress-label").textContent = labels[progress.status] || "處理照片";
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
    const cleaned = String(text || "").trim();
    let match = cleaned.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
    let hour;
    let minute;
    if (match) {
      hour = Number(match[1]);
      minute = Number(match[2]);
    } else {
      const digits = cleaned.replace(/\D/g, "");
      if (digits.length === 3) {
        hour = Number(digits[0]);
        minute = Number(digits.slice(1));
      } else if (digits.length === 4) {
        hour = Number(digits.slice(0, 2));
        minute = Number(digits.slice(2));
      } else {
        return null;
      }
    }
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  async function imageDimensions(file) {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }

  function extractOcrRows(words, half, width, height) {
    const startDay = half === "first" ? 1 : 16;
    const count = half === "first" ? 15 : 16;
    const startY = height * 0.39;
    const endY = height * (half === "first" ? 0.82 : 0.86);
    const groups = new Map();

    (words || []).forEach(word => {
      const bbox = word.bbox || {};
      const x = ((bbox.x0 || 0) + (bbox.x1 || 0)) / 2;
      const y = ((bbox.y0 || 0) + (bbox.y1 || 0)) / 2;
      if (x < width * 0.16 || x > width * 0.62 || y < startY - height * 0.035 || y > endY + height * 0.035) return;

      const index = Math.max(0, Math.min(count - 1, Math.round((y - startY) / (endY - startY) * (count - 1))));
      const day = startDay + index;
      if (!groups.has(day)) groups.set(day, { times: [], suspicious: [] });
      const normalized = normalizeOcrTime(word.text);
      if (normalized) {
        groups.get(day).times.push({ time: normalized, x, confidence: Number(word.confidence || 0) });
      } else if (/\d/.test(word.text || "") && String(word.text).replace(/\D/g, "").length >= 3) {
        groups.get(day).suspicious.push(word.text);
      }
    });

    return [...groups.entries()].map(([day, group]) => {
      group.times.sort((a, b) => a.x - b.x);
      const unique = group.times.filter((item, index, array) => index === 0 || item.time !== array[index - 1].time);
      return { day, times: unique, suspicious: group.suspicious };
    }).sort((a, b) => a.day - b.day);
  }

  async function recognizeUpload(uploadId) {
    const upload = runtimeUploads.find(item => item.id === uploadId);
    if (!upload) return;
    upload.status = "processing";
    upload.statusText = "辨識中";
    renderUploads();

    try {
      const worker = await getOcrWorker();
      const size = await imageDimensions(upload.file);
      const result = await worker.recognize(upload.file);
      const rows = extractOcrRows(result.data.words || [], upload.half, size.width, size.height);
      let recognizedCount = 0;
      let unreadableCount = 0;

      rows.forEach(row => {
        const date = `${state.settings.month}-${String(row.day).padStart(2, "0")}`;
        if (!date.startsWith(state.settings.month) || row.day > daysInMonth(state.settings.month)) return;
        const key = attendanceKey(upload.employeeId, date);
        if (state.attendance[key]?.status === "confirmed") return;

        if (row.times.length >= 2) {
          const confidence = Math.round((row.times[0].confidence + row.times[1].confidence) / 2);
          state.attendance[key] = {
            employeeId: upload.employeeId,
            date,
            segments: [{ start: row.times[0].time, end: row.times[1].time }],
            status: "review",
            source: `OCR：${upload.file.name}`,
            confidence,
            note: "OCR 初步辨識，請對照原圖後改為已確認。"
          };
          recognizedCount += 1;
        } else if (row.times.length === 1 || row.suspicious.length) {
          state.attendance[key] = {
            employeeId: upload.employeeId,
            date,
            segments: row.times.length ? [{ start: row.times[0].time, end: "" }] : [],
            status: "unreadable",
            source: `OCR：${upload.file.name}`,
            confidence: row.times[0]?.confidence || 0,
            note: `${date} 打卡時間無法完整判斷，請人工輸入。`
          };
          unreadableCount += 1;
        }
      });

      upload.status = "done";
      upload.statusText = `辨識 ${recognizedCount} 日・待人工確認${unreadableCount ? `・${unreadableCount} 日無法判斷` : ""}`;
      $("#attendance-employee").value = upload.employeeId;
      saveState("OCR 結果已儲存");
      renderAll();
      showView("attendance");
      toast(recognizedCount || unreadableCount ? "辨識完成，請逐日對照原圖確認。" : "沒有可靠辨識到時間，請改用人工輸入。");
    } catch (error) {
      console.warn("OCR failed", error);
      upload.status = "error";
      upload.statusText = "辨識失敗，請人工輸入";
      renderUploads();
      toast("OCR 無法完成；照片仍可查看，請人工輸入打卡時間。");
    } finally {
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

    $("#attendance-employee").addEventListener("change", renderAttendance);
    $("#add-manual-record").addEventListener("click", () => openAttendanceDialog());
    $("#attendance-body").addEventListener("click", event => {
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
      saveState();
      $("#attendance-dialog").close();
      renderAll();
      toast("打卡紀錄已儲存");
    });
    $("#delete-attendance").addEventListener("click", () => {
      const date = $("#attendance-date").value;
      const key = attendanceKey(attendanceDialogEmployeeId, date);
      delete state.attendance[key];
      delete state.leaveRecords[key];
      saveState();
      $("#attendance-dialog").close();
      renderAll();
      toast("紀錄已刪除");
    });

    $$("[data-close-dialog]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));

    $("#adjustment-form").addEventListener("submit", event => {
      event.preventDefault();
      state.adjustments.push({
        id: uid("adjustment"),
        employeeId: $("#adjustment-employee").value,
        name: $("#adjustment-name").value.trim(),
        type: $("#adjustment-type").value,
        amount: Number($("#adjustment-amount").value || 0),
        recurring: $("#adjustment-recurring").checked,
        month: $("#adjustment-recurring").checked ? "" : state.settings.month
      });
      event.target.reset();
      saveState();
      renderAll();
      toast("薪資項目已加入");
    });
    $("#adjustment-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-adjustment");
      if (!button) return;
      state.adjustments = state.adjustments.filter(adjustment => adjustment.id !== button.dataset.id);
      saveState();
      renderAll();
      toast("薪資項目已移除");
    });

    $("#rules-form").addEventListener("submit", event => {
      event.preventDefault();
      state.settings.nationalMultiplier = Number($("#national-multiplier").value || 2);
      state.settings.typhoonMultiplier = Number($("#typhoon-multiplier").value || 1.5);
      state.settings.roundingMode = $("#rounding-mode").value;
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
      state.specialDays.push({ id: uid("special-day"), date, label, type, official: false });
      event.target.reset();
      saveState();
      renderAll();
      toast("特殊日已新增");
    });
    $("#special-day-list").addEventListener("click", event => {
      const button = event.target.closest(".remove-special-day");
      if (!button) return;
      state.specialDays = state.specialDays.filter(day => day.id !== button.dataset.id);
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
      if (button.dataset.uploadAction === "view") window.open(upload.url, "_blank", "noopener");
      if (button.dataset.uploadAction === "remove") {
        URL.revokeObjectURL(upload.url);
        runtimeUploads = runtimeUploads.filter(item => item.id !== upload.id);
        renderUploads();
      }
    });

    $("#payroll-body").addEventListener("click", event => {
      const button = event.target.closest(".view-payslip");
      if (button) openPayslip(button.dataset.employeeId);
    });
    $("#print-payslip").addEventListener("click", () => window.print());
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
    renderAll();
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
