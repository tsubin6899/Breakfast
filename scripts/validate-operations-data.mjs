import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadBrowserData(relativePath, property) {
  const code = await readFile(resolve(ROOT, relativePath), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: relativePath });
  assert(sandbox.window[property], `${relativePath} 未建立 ${property}`);
  return sandbox.window[property];
}

function sum(rows) {
  return rows.reduce((total, row) => total + Number(row.amount || 0), 0);
}

async function validatePage(htmlPath, scriptPath) {
  const [html, script] = await Promise.all([
    readFile(resolve(ROOT, htmlPath), "utf8"),
    readFile(resolve(ROOT, scriptPath), "utf8")
  ]);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert(duplicateIds.length === 0, `${htmlPath} 有重複 id：${[...new Set(duplicateIds)].join("、")}`);
  const referencedIds = [...script.matchAll(/\$\("#([^"]+)"\)/g)].map(match => match[1]);
  const missingIds = [...new Set(referencedIds.filter(id => !ids.includes(id)))];
  assert(missingIds.length === 0, `${scriptPath} 參照不存在的欄位：${missingIds.join("、")}`);
}

const [historicalAccounting, currentAccounting, backupAccounting, uberStatement, historicalSalary, currentSalary] = await Promise.all([
  loadBrowserData("accounting/data/revenue-history-2022-2025.js", "BREAKFAST_ACCOUNTING_HISTORY_2022_2025"),
  loadBrowserData("accounting/data/revenue-history-2026.js", "BREAKFAST_ACCOUNTING_HISTORY_2026"),
  loadBrowserData("accounting/data/accounting-backup-2026-07-22.js", "BREAKFAST_ACCOUNTING_BACKUP_2026_07_22"),
  loadBrowserData("accounting/data/uber-statement-2026-07-24.js", "BREAKFAST_UBER_STATEMENT_2026_07_24"),
  loadBrowserData("salary_app/data/salary-history-2022-2025.js", "BREAKFAST_SALARY_HISTORY_2022_2025"),
  loadBrowserData("salary_app/data/salary-history-2026-h1.js", "BREAKFAST_SALARY_HISTORY_2026_H1")
]);
const accountingHistories = [historicalAccounting, currentAccounting, backupAccounting, uberStatement];
const accounting = {
  transactions: accountingHistories.flatMap(history => history.transactions || []),
  reconciliation: accountingHistories.flatMap(history => history.reconciliation || [])
};
const salary = {
  payroll: Object.assign({}, historicalSalary.payroll || {}, currentSalary.payroll || {})
};

const forbiddenEmployeeNames = new Set(["采葳", "年終", "待補", "其他薪資支出（原營業額檔）"]);
for (const employee of historicalSalary.employees || []) {
  assert(!forbiddenEmployeeNames.has(employee.name), `歷史員工仍含誤列名稱：${employee.name}`);
}
for (const row of historicalSalary.attendance || []) {
  assert(!forbiddenEmployeeNames.has(row.employeeName), `歷史出勤仍含誤列名稱：${row.employeeName}`);
}
for (const rows of Object.values(historicalSalary.payroll || {})) {
  for (const row of rows) {
    assert(!forbiddenEmployeeNames.has(row.employeeName), `歷史薪資仍含誤列名稱：${row.employeeName}`);
  }
}
assert(
  (historicalSalary.employees || []).some(employee => employee.name === "黃采葳"),
  "歷史員工缺少合併後的黃采葳"
);

assert(accounting.transactions.length > 0, "記帳匯入資料為空");
const ids = accounting.transactions.map(row => row.id);
assert(new Set(ids).size === ids.length, "記帳匯入資料存在重複 id");
assert(backupAccounting.transactions.length === 90, "記帳備份去重後應匯入 90 筆");
assert(uberStatement.transactions.length === 9, "Uber 對帳單應彙總為 9 筆每日收入");
assert(sum(uberStatement.transactions) === 20493, "Uber 對帳單每日淨收入合計應為 20,493 元");
assert(uberStatement.sourceSummary.rowCount === 135, "Uber 對帳單應包含 135 筆原始明細");
assert(
  Number(uberStatement.sourceSummary.salesIncludingTax)
    + Number(uberStatement.sourceSummary.orderErrorAdjustmentsIncludingTax)
    + Number(uberStatement.sourceSummary.platformServiceFeesIncludingTax)
    === Number(uberStatement.sourceSummary.netAmount),
  "Uber 銷售額、退款調整、平台服務費與淨收入未勾稽"
);
const statementDates = new Set(uberStatement.transactions.map(row => row.date));
const olderUberOverlap = [historicalAccounting, currentAccounting, backupAccounting]
  .flatMap(history => history.transactions || [])
  .filter(row => row.type === "income" && /uber/i.test(row.category || "") && statementDates.has(row.date));
assert(olderUberOverlap.length === 0, "Uber 對帳單日期與既有 Uber 收入重複");
for (const row of accounting.transactions) {
  assert(/^20(22|23|24|25|26)-\d{2}-\d{2}$/.test(row.date), `日期格式錯誤：${row.id}`);
  assert(["income", "expense"].includes(row.type), `收支類型錯誤：${row.id}`);
  assert(Number.isFinite(Number(row.amount)) && Number(row.amount) !== 0, `金額錯誤：${row.id}`);
}
for (const group of ["食材成本", "固定成本", "飲品成本", "雜貨成本"]) {
  const amount = accounting.transactions
    .filter(row => row.type === "expense" && row.group === group)
    .reduce((total, row) => total + Number(row.amount || 0), 0);
  assert(amount > 0, `${group} 缺少可供分析的支出資料`);
}
assert(
  Object.values(salary.payroll).flat().reduce((total, row) => total + Number(row.total || 0), 0) > 0,
  "人事成本缺少可供分析的薪資資料"
);

const report = [];
for (const history of accountingHistories) {
  for (const expected of history.reconciliation || []) {
    const rows = (history.transactions || []).filter(row => row.date.startsWith(expected.period));
    const importedIncome = sum(rows.filter(row => row.type === "income"));
    const importedExpense = sum(rows.filter(row => row.type === "expense"));
    const payroll = (salary.payroll?.[expected.period] || []).reduce((total, row) => total + Number(row.total || 0), 0);

    if (expected.statementNetAmount !== undefined) {
      assert(Math.abs(importedIncome - Number(expected.statementNetAmount)) < .01, `${expected.period} Uber 每日淨收入合計不符`);
      assert(Math.abs(importedIncome - Number(expected.importedIncome)) < .01, `${expected.period} Uber 匯入金額不符`);
      assert(importedExpense === 0, `${expected.period} Uber 對帳單不應建立支出列`);
    } else if (expected.sourceEligibleIncome !== undefined) {
      assert(Math.abs(importedIncome - Number(expected.importedIncome)) < .01, `${expected.period} 備份收入匯入合計不符`);
      assert(Math.abs(importedExpense - Number(expected.importedExpense)) < .01, `${expected.period} 備份支出匯入合計不符`);
      assert(
        Math.abs(Number(expected.sourceEligibleIncome) - importedIncome - Number(expected.matchedExistingIncome)) < .01,
        `${expected.period} 備份收入去重勾稽不符`
      );
      assert(
        Math.abs(Number(expected.sourceEligibleExpense) - importedExpense - Number(expected.matchedExistingExpense)) < .01,
        `${expected.period} 備份支出去重勾稽不符`
      );
    } else {
      const importedIncomeExpected = Number(expected.importedIncome);
      const importedExpenseExpected = Number(expected.importedExpenseExcludingPayroll ?? expected.importedOperating);
      const sourceIncome = Number(expected.sourceIncome ?? expected.expectedIncome);
      const sourceExpense = Number(expected.sourceExpenseExcludingPayroll ?? expected.expectedOperating);
      assert(Math.abs(importedIncome - importedIncomeExpected) < .01, `${expected.period} 收入彙總不符`);
      assert(Math.abs(importedExpense - importedExpenseExpected) < .01, `${expected.period} 支出彙總不符`);
      assert(Math.abs(sourceIncome - importedIncome + Number(expected.incomeDelta)) < .01, `${expected.period} 收入勾稽差額不符`);
      assert(Math.abs(importedExpense - sourceExpense - Number(expected.expenseDelta)) < .01, `${expected.period} 支出勾稽差額不符`);
      if (expected.salarySnapshotTotal !== undefined) {
        assert(Math.abs(payroll - Number(expected.salarySnapshotTotal)) < .01, `${expected.period} 薪資快照合計不符`);
      }
    }
    report.push({
      source: history.source,
      month: expected.period,
      income: importedIncome,
      operatingExpense: importedExpense,
      payroll,
      workbookExpenseDifference: expected.expenseDelta
    });
  }
}

assert(Object.keys(historicalSalary.payroll || {}).length === 48, "2022–2025 薪資月份應為 48 個月");
assert(historicalSalary.attendance.length > 4000, "2022–2025 出勤明細數量異常");
for (const row of historicalSalary.attendance) {
  assert(/^20(22|23|24|25)-\d{2}-\d{2}$/.test(row.date), `歷史出勤日期格式錯誤：${row.employeeName}`);
  assert(Array.isArray(row.segments) && row.segments.length > 0, `歷史出勤缺少時段：${row.employeeName} ${row.date}`);
}

await Promise.all([
  validatePage("accounting/index.html", "accounting/app.js"),
  validatePage("dashboard_cost/index.html", "dashboard_cost/app.js")
]);

for (const htmlPath of ["salary_app/index.html", "accounting/index.html", "dashboard_cost/index.html"]) {
  const html = await readFile(resolve(ROOT, htmlPath), "utf8");
  assert(html.includes("operations-brandbar.css"), `${htmlPath} 未載入共用品牌列樣式`);
  assert(html.includes("operations-store.js"), `${htmlPath} 未載入共用營運資料橋接`);
  assert((html.match(/class="suite-system-nav"/g) || []).length === 1, `${htmlPath} 缺少三系統品牌導覽`);
  assert((html.match(/aria-current="page"/g) || []).length === 1, `${htmlPath} 未正確標示目前系統`);
}

const featureChecks = [
  ["salary_app/index.html", ["month-close-checks", "payroll-revisions", "confirm-suggested-rests", "add-employee", "delete-employee", "deleted-employee-archive", "deleted-employee-list", "workflow-reason-dialog", "workflow-reason-input", "employee-locked-note"]],
  ["accounting/index.html", [
    "accounting-tab-entry", "accounting-tab-ledger", "accounting-tab-import", "accounting-tab-catalog", "accounting-tab-safety",
    "accounting-page-title", "entry-receipt", "entry-recurring", "daily-reconciliation-form", "accounting-exceptions",
    "uber-statement-file", "uber-import-review", "uber-import-confirm",
    "foodpanda-statement-file", "foodpanda-import-review", "foodpanda-import-confirm", "foodpanda-settlement-schedule",
    "catalog-item-form", "catalog-item-type", "catalog-item-group", "catalog-item-name", "catalog-groups",
    "report-dashboard", "report-download-pdf", "report-trend-card", "report-expense-groups-card", "report-income-sources-card", "report-vendors-card", "report-matrix-card",
    "copy-yesterday", "copy-last-week", "quick-entry-presets", "mobile-quick-add",
    "toggle-daily-close", "daily-close-status", "month-close-checklist", "toggle-accounting-month-lock",
    "snapshot-list", "create-snapshot-now", "undo-accounting-action", "accounting-audit-log",
    "catalog-manage-dialog", "catalog-manage-form"
  ]],
  ["dashboard_cost/index.html", [
    "year-filter", "month-filter", "cost-chart",
    "food-cost-chart", "labor-cost-chart", "fixed-cost-chart", "drink-cost-chart", "grocery-cost-chart",
    "operations-alerts", "operations-alert-count",
    "kpi-mom-change", "kpi-yoy-change", "kpi-platform-share", "kpi-labor-per-10k",
    "analysis-targets", "target-food-rate", "target-labor-rate", "target-fixed-rate",
    "save-analysis-targets", "target-result-grid", "vendor-trend-chart"
  ]]
];
for (const [htmlPath, requiredIds] of featureChecks) {
  const html = await readFile(resolve(ROOT, htmlPath), "utf8");
  for (const id of requiredIds) assert(html.includes(`id="${id}"`), `${htmlPath} 缺少營運功能 ${id}`);
}

const [accountingApp, salaryApp] = await Promise.all([
  readFile(resolve(ROOT, "accounting/app.js"), "utf8"),
  readFile(resolve(ROOT, "salary_app/app.js"), "utf8")
]);
for (const capability of ["catalogItemSettings", "dailyClosures", "closedMonths", "auditLog", "undoLog", "createSafetySnapshot", "applyCatalogMappings", "exportReportJpg", "exportFullReportPdf"]) {
  assert(accountingApp.includes(capability), `記帳系統缺少安全或分類管理能力：${capability}`);
}
for (const group of ["現金收入", "平台收入", "其他收入", "食材成本", "飲品成本", "雜貨成本", "人事成本", "固定成本", "其他支出"]) {
  assert(accountingApp.includes(`"${group}"`), `分類與項目設定缺少預設分類：${group}`);
}
for (const item of ["現金營業收入", "line Pay經營收入", "快一點line pay收入", "Uber eat外送", "Foodpanda外送", "正式員工薪資", "臨時工讀日薪"]) {
  assert(accountingApp.includes(`"${item}"`), `分類與項目設定缺少預設項目：${item}`);
}
assert(accountingApp.includes('"現金收入": ["現金營業收入", "line Pay經營收入", "快一點line pay收入"]'), "Line Pay 與快一點應列在現金收入預設項目");
assert(!accountingApp.includes('"foodpanda外送"'), "記帳系統不得保留小寫 foodpanda 的顯示名稱");
const accountingHtml = await readFile(resolve(ROOT, "accounting/index.html"), "utf8");
assert(accountingHtml.includes("每月 5 日與 20 日記得匯入對帳單") && accountingHtml.includes("當月 1 日至 15 日") && accountingHtml.includes("次月 10 日"), "foodpanda 匯入區缺少結算與匯款提醒");

const dashboardHtml = await readFile(resolve(ROOT, "dashboard_cost/index.html"), "utf8");
assert(
  dashboardHtml.indexOf('id="operations-alerts"') > dashboardHtml.indexOf('id="monthly-table"'),
  "跨系統異常中心必須位於分析內容最下方"
);

const sharedStore = await readFile(resolve(ROOT, "shared/operations-store.js"), "utf8");
for (const capability of ["getGlobalMonth", "setGlobalMonth", "createSnapshot", "autoSnapshot", "listSnapshots", "getSnapshot"]) {
  assert(sharedStore.includes(capability), `跨系統資料層缺少能力：${capability}`);
}

for (const capability of ["workflowActionMessage", "requireWorkflowAction", "dataset.workflowAvailable", 'classList.toggle("is-unavailable"', '$("#workflow-reason-dialog")', "dialog.showModal()", "await requestCloseOverride"] ) {
  assert(salaryApp.includes(capability), `薪資流程按鈕缺少狀態回饋：${capability}`);
}
assert(salaryApp.includes("payProfileSignature") && salaryApp.includes('if (!employee && !requireUnlockedMonth()) return;'), "已鎖定月份不得阻止既有員工開啟基本資料編輯");

const root = await readFile(resolve(ROOT, "index.html"), "utf8");
for (const link of ["/salary_app/", "/accounting/", "/dashboard_cost/"]) {
  assert(root.includes(`href="${link}"`), `首頁缺少連結 ${link}`);
}

console.log(`記帳匯入：${accounting.transactions.length.toLocaleString("zh-TW")} 筆，2022–2026 年 ID、日期、金額與月份勾稽皆通過。`);
console.table(report);
