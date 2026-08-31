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

const [homeHtml, homeJs, salaryHtml] = await Promise.all([
  readFile(resolve(ROOT, "index.html"), "utf8"),
  readFile(resolve(ROOT, "shared/home.js"), "utf8"),
  readFile(resolve(ROOT, "salary_app/index.html"), "utf8")
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
assert(!salaryHtml.includes("第 2 段") && !salaryHtml.includes("第 3 段"), "早餐店打卡介面不得顯示多餘時段");
assert(!salaryHtml.includes('id="add-segment"'), "單日打卡不得新增第二時段");

console.log("營運中心、預算異常與 AI 佇列檢查完成。");
