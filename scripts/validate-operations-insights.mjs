import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile(resolve(ROOT, "shared/operations-insights.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "shared/operations-insights.js" });
const insights = sandbox.window.BreakfastOperationsInsights;
assert(insights, "營運洞察模組未正確載入");

const budget = insights.normalizeBudget({
  targetIncome: "500000",
  targetExpense: 300000,
  targetNet: -100,
  groups: { 食材成本: "120000" }
}, ["食材成本", "固定成本"]);
assert(budget.targetIncome === 500000, "收入目標正規化錯誤");
assert(budget.targetNet === 0, "淨額目標不得為負數");
assert(budget.groups.食材成本 === 120000 && budget.groups.固定成本 === 0, "分類預算正規化錯誤");

const anomalies = insights.detectMonthAnomalies(
  [{ counterparty: "蛋商", amount: 9000 }, { counterparty: "蛋商", amount: 3000 }, { category: "瓦斯", amount: 2500 }],
  [{ counterparty: "蛋商", amount: 8000 }, { category: "瓦斯", amount: 2000 }],
  { minimumAmount: 3000, threshold: .25 }
);
assert(anomalies.length === 1 && anomalies[0].name === "蛋商", "廠商支出異常偵測錯誤");
assert(Math.abs(anomalies[0].change - .5) < .0001, "廠商支出增幅計算錯誤");

const rows = insights.buildBudgetRows(budget, { income: 400000, expense: 260000, net: 140000 }, { 食材成本: 100000 });
assert(rows.some(row => row.key === "income" && row.ratio === .8), "收入目標進度錯誤");
assert(rows.some(row => row.key === "group:食材成本" && Math.abs(row.ratio - (5 / 6)) < .0001), "分類預算進度錯誤");

const [homeHtml, homeJs, salaryHtml, salaryJs, accountingHtml, accountingJs, accountingCss, portalJs, shellJs] = await Promise.all([
  readFile(resolve(ROOT, "index.html"), "utf8"),
  readFile(resolve(ROOT, "shared/home.js"), "utf8"),
  readFile(resolve(ROOT, "salary_app/index.html"), "utf8"),
  readFile(resolve(ROOT, "salary_app/app.js"), "utf8"),
  readFile(resolve(ROOT, "accounting/index.html"), "utf8"),
  readFile(resolve(ROOT, "accounting/app.js"), "utf8"),
  readFile(resolve(ROOT, "accounting/styles.css"), "utf8"),
  readFile(resolve(ROOT, "employee_portal/app.js"), "utf8"),
  readFile(resolve(ROOT, "shared/operations-shell.js"), "utf8")
]);
for (const id of ["home-month", "home-cloud-state", "home-actions", "home-budget", "home-sync", "home-audit"]) {
  assert(homeHtml.includes(`id="${id}"`), `今日店務中心缺少 ${id}`);
  assert(homeJs.includes(`#${id}`), `今日店務中心腳本未使用 ${id}`);
}
for (const entry of ["home-launchpad", "quick-tool-grid", "開始記帳", "打卡與薪資", "經營報表"]) {
  assert(homeHtml.includes(entry), `手機首頁缺少主要入口：${entry}`);
}
for (const id of ["ai-queue-summary", "recognize-all-uploads", "retry-failed-uploads"]) {
  assert(salaryHtml.includes(`id="${id}"`), `打卡 AI 佇列缺少 ${id}`);
}
for (const id of ["employee-birthday", "employee-birthday-gift-amount"]) {
  assert(salaryHtml.includes(`id="${id}"`), `員工設定缺少 ${id}`);
}
for (const id of ["employee-reminder-count", "employee-reminders"]) {
  assert(salaryHtml.includes(`id="${id}"`) && salaryJs.includes(`#${id}`), `員工提醒缺少 ${id}`);
}
for (const id of ["open-batch-income", "batch-income-dialog", "payable-form", "payable-list"]) {
  assert(accountingHtml.includes(`id="${id}"`), `快速記帳與應付帳款缺少 ${id}`);
}
assert(accountingJs.includes('source: "batch-daily-income"'), "批次每日收入未標示資料來源");
assert(accountingJs.includes("疑似重複") && accountingJs.includes("payableId"), "重複帳務或應付入帳防護未啟用");
assert(shellJs.includes('href: "/accounting/?view=ledger"') && shellJs.includes('label: "月份收支明細"'), "手機第一個入口未指向月份收支明細");
assert(shellJs.includes('href: "/accounting/?view=report"') && shellJs.includes('label: "收入支出統計報表"'), "手機第二個入口未指向收入支出統計報表");
assert(accountingCss.includes("grid-template-columns: repeat(4, minmax(0, 1fr))") && accountingCss.includes(".calendar-day.is-outside { display: none; }"), "手機月曆未採一列四欄");
assert(accountingJs.includes('closest("[data-calendar-date]")'), "手機月曆日期未串接當日收支明細");
assert(portalJs.includes("年假試算餘額") && portalJs.includes("annualRemaining"), "員工入口未顯示個人年假摘要");
assert(!salaryHtml.includes("第 2 段") && !salaryHtml.includes("第 3 段"), "早餐店打卡介面不得顯示多餘時段");
assert(!salaryHtml.includes('id="add-segment"'), "單日打卡不得新增第二時段");
for (const [html, prefix] of [[salaryHtml, "payroll"], [accountingHtml, "accounting"]]) {
  for (const suffix of ["cloud-last-success", "cloud-pending", "cloud-version"]) {
    assert(html.includes(`id="${prefix}-${suffix}"`), `雲端同步面板缺少 ${prefix}-${suffix}`);
  }
  assert(html.includes('/shared/cloud-sync.js'), `${prefix} 頁面未載入共用雲端同步模組`);
}
assert(homeHtml.includes('/shared/cloud-sync.js'), "首頁未載入共用雲端同步模組");
assert(homeJs.includes("lastSuccessAt") && homeJs.includes("dirty"), "首頁未顯示待同步與最後成功狀態");

console.log("營運中心、預算異常與 AI 佇列檢查完成。");
