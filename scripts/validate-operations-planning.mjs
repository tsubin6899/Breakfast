import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = await readFile(resolve(ROOT, "shared/operations-planning.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "shared/operations-planning.js" });
const planning = sandbox.window.BreakfastOperationsPlanning;
assert(planning, "現金流與商品毛利模組未正確載入");

const forecast = planning.buildCashForecast({
  historical: [
    { month: "2026-05", income: 500000, expenses: 350000 },
    { month: "2026-06", income: 550000, expenses: 400000 },
    { month: "2026-07", income: 600000, expenses: 450000 }
  ],
  payables: [
    { dueDate: "2026-08-10", amount: 30000, status: "open" },
    { dueDate: "2026-08-15", amount: 9000, status: "paid" }
  ],
  openingCash: 100000,
  months: 3
});
assert(forecast.rows.length === 3 && forecast.rows[0].month === "2026-08", "預測月份推進錯誤");
assert(forecast.averageIncome === 550000 && forecast.averageExpenses === 400000, "三個月平均值錯誤");
assert(forecast.rows[0].payableAmount === 30000, "尚未付款應付帳款未納入預測");
assert(forecast.rows[0].endingCash === 220000, "月底可用現金計算錯誤");

const products = planning.productMetrics([
  { id: "egg", name: "蛋餅", price: 50, cost: 20, units: 100 },
  { id: "tea", name: "紅茶", price: 25, cost: 5, units: 200 }
]);
assert(products.rows[0].unitMargin === 30 && products.rows[0].marginRate === .6, "單品毛利計算錯誤");
assert(products.totals.monthlyContribution === 7000, "商品月貢獻加總錯誤");
assert(Math.abs(products.totals.marginRate - .7) < .0001, "整體加權毛利率錯誤");

const [html, app] = await Promise.all([
  readFile(resolve(ROOT, "dashboard_cost/index.html"), "utf8"),
  readFile(resolve(ROOT, "dashboard_cost/app.js"), "utf8")
]);
for (const id of ["analysis-planning", "cash-forecast-list", "product-margin-form", "product-margin-list"]) {
  assert(html.includes(`id="${id}"`), `分析頁缺少 ${id}`);
}
assert(app.includes("buildCashForecast") && app.includes("productMetrics"), "分析頁未串接預測模組");

console.log("現金流預測與商品毛利檢查完成。");
