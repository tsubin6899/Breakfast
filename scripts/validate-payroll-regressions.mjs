import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nearly(actual, expected, tolerance = 0.01) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

const storage = new Map();
const window = {
  BREAKFAST_TEST_MODE: true,
  BREAKFAST_LOCAL_MODE: true,
  BREAKFAST_SALARY_HISTORY_2022_2025: null,
  BREAKFAST_SALARY_HISTORY_2026_H1: null,
  location: { search: "", protocol: "http:" },
  setTimeout,
  clearTimeout
};
const sandbox = {
  window,
  document: {
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  },
  localStorage: {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  console,
  Intl,
  Date,
  Math,
  URLSearchParams,
  setTimeout,
  clearTimeout
};
sandbox.globalThis = sandbox;

const overtimeCode = await readFile(resolve(ROOT, "salary_app/special-overtime-rules.js"), "utf8");
vm.runInNewContext(overtimeCode, sandbox, { filename: "special-overtime-rules.js" });
assert(window.BREAKFAST_SPECIAL_OVERTIME, "特殊加班規則未載入");
const historyCode = await readFile(resolve(ROOT, "salary_app/data/salary-history-2022-2025.js"), "utf8");
vm.runInNewContext(historyCode, sandbox, { filename: "salary-history-2022-2025.js" });
assert(window.BREAKFAST_SALARY_HISTORY_2022_2025, "歷史薪資資料未載入");
const currentHistoryCode = await readFile(resolve(ROOT, "salary_app/data/salary-history-2026-h1.js"), "utf8");
vm.runInNewContext(currentHistoryCode, sandbox, { filename: "salary-history-2026-h1.js" });
assert(window.BREAKFAST_SALARY_HISTORY_2026_H1, "2026 薪資資料未載入");
const appCode = await readFile(resolve(ROOT, "salary_app/app.js"), "utf8");
vm.runInNewContext(appCode, sandbox, { filename: "salary_app/app.js" });

const api = window.BreakfastPayrollTestApi;
assert(api, "薪資測試介面未建立");
const hydratedHistoryState = api.getState();
const compactHistoryState = api.stateForPersistence(hydratedHistoryState);
assert(Object.keys(hydratedHistoryState.closedMonths).length >= 48, "執行時應載入 48 個歷史薪資月份");
assert(Object.keys(compactHistoryState.closedMonths).length === 0, "本機儲存不得重複寫入內建歷史薪資快照");
assert(Object.keys(compactHistoryState.attendance).length === 0, "本機儲存不得重複寫入內建歷史出勤");
assert(
  compactHistoryState.employees.every(employee => !String(employee.id).startsWith("history-employee-")),
  "本機儲存不得重複寫入內建歷史員工"
);
assert(JSON.stringify(compactHistoryState).length < 500000, "精簡後本機薪資狀態仍過大，可能超出瀏覽器額度");

// 舊瀏覽器資料的同名員工與誤列會在載入時自動清理，出勤改掛正確員工。
let migrated = api.createState();
migrated.employees.push(api.normalizeEmployee({ id: "legacy-tsai", name: "采葳", payType: "hourly", hourlyRate: 200, active: false }));
migrated.employees.push(api.normalizeEmployee({ id: "legacy-balance", name: "其他薪資支出（原營業額檔）", payType: "monthly", monthlySalary: 1000, active: false }));
migrated.attendance["legacy-tsai|2026-07-01"] = {
  employeeId: "legacy-tsai", date: "2026-07-01", source: "人工輸入", segments: [{ start: "08:00", end: "09:00" }]
};
migrated.attendance["legacy-balance|2026-07-01"] = {
  employeeId: "legacy-balance", date: "2026-07-01", source: "匯入：舊檔", segments: [{ start: "08:00", end: "09:00" }]
};
migrated = api.setState(migrated);
assert(!migrated.employees.some(employee => ["采葳", "年終", "待補", "其他薪資支出（原營業額檔）"].includes(employee.name)), "舊員工誤列未清除");
assert(migrated.attendance["huang|2026-07-01"]?.employeeId === "huang", "采葳出勤未合併到黃采葳");
assert(!Object.values(migrated.attendance).some(record => record.employeeId === "legacy-balance"), "誤列員工出勤未清除");

function record(employeeId, date, start, end) {
  return {
    employeeId,
    date,
    status: "confirmed",
    source: "regression-test",
    segments: [{ start, end }]
  };
}

function reset() {
  return api.setState(api.createState());
}

// 老闆固定月薪：免打卡，也不產生加班與特殊日加給。
let state = reset();
let owner = state.employees.find(employee => employee.id === "yixin");
let result = api.calculatePayroll(owner, "2026-07");
assert(result.regularPay === 50000, "以馨固定月薪應為 50,000 元");
assert(result.overtimePay === 0 && result.specialPay === 0, "免打卡老闆不應產生加班或特殊日加給");
assert(result.issues === 0, "免打卡老闆不應產生出勤異常");

// 何秀芷七月：28 天有打卡、3 天空白，空白日應辨識為建議月休。
state = reset();
const he = state.employees.find(employee => employee.id === "he");
const blankDays = new Set([3, 6, 11]);
for (let day = 1; day <= 31; day += 1) {
  if (blankDays.has(day)) continue;
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  state.attendance[api.attendanceKey("he", date)] = record("he", date, "08:00", "15:00");
}
api.setState(state);
assert(api.monthlyRestDays(he, "2026-07") === 3, "何秀芷 2026 年 7 月三天空白應計為 3 天月休");
assert(api.suggestedRestDates(he, "2026-07").length === 3, "何秀芷七月應有 3 個待確認建議月休日");
result = api.calculatePayroll(he, "2026-07");
assert(result.specialPay === 0, "何秀芷設定為不自動加給，國定假日／颱風加給應為 0");
assert(result.overtimePay > 0, "何秀芷特殊班表下應正確產生提早上班加班費");

// 時薪員工國定假日：逐分鐘基本工資，再補足雙倍的額外一倍。
state = reset();
const hourly = api.normalizeEmployee({
  id: "reg-hourly",
  name: "測試時薪員工",
  payType: "hourly",
  hourlyRate: 200,
  weekendRate: 220,
  holidayRate: 200,
  attendanceRequired: true,
  active: true,
  annualLeave: 0
});
state.employees.push(hourly);
state.attendance[api.attendanceKey(hourly.id, "2026-09-28")] = record(hourly.id, "2026-09-28", "08:00", "09:00");
api.setState(state);
result = api.calculatePayroll(hourly, "2026-09");
assert(result.regularMinutes === 60, "國定假日時薪案例應精確計算 60 分鐘");
assert(nearly(result.regularPay, 200) && nearly(result.specialPay, 200) && result.total === 400, `國定假日 1 小時、時薪 200 元，應為基本 200＋加給 200＝400；實際 ${result.regularPay}＋${result.specialPay}＝${result.total}`);

// 月薪缺勤：缺勤一日按月薪三十分之一扣除，並保留既有保險扣款。
state = reset();
const heAbsence = state.employees.find(employee => employee.id === "he");
state.leaveRecords[api.attendanceKey("he", "2026-07-03")] = {
  employeeId: "he",
  date: "2026-07-03",
  type: "absence",
  days: 1,
  note: "測試缺勤"
};
api.setState(state);
result = api.calculatePayroll(heAbsence, "2026-07");
assert(nearly(result.deductions, 872 + 41000 / 30), "缺勤扣款應為月薪 1/30，另加既有保險扣款");
assert(result.total === 38761, `缺勤案例實領應為 38,761 元，實際 ${result.total}`);

// 固定每小時加班：精確到分鐘。
state = reset();
const heMinute = state.employees.find(employee => employee.id === "he");
state.attendance[api.attendanceKey("he", "2026-07-02")] = record("he", "2026-07-02", "07:49", "15:00");
api.setState(state);
result = api.calculatePayroll(heMinute, "2026-07");
assert(result.overtimeMinutes === 11, "07:49 到 08:00 應精確計算 11 分鐘加班");
assert(nearly(result.overtimePay, 11 / 60 * 200), "11 分鐘、每小時 200 元的加班費計算不符");

console.log("薪資回歸測試通過：老闆固定月薪、何秀芷月休與特殊加班、時薪國定假日、缺勤扣薪及分鐘加班皆正確。");
