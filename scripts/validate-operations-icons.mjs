import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const pages = ["index.html", "salary_app/index.html", "accounting/index.html", "dashboard_cost/index.html"];
const contents = await Promise.all(pages.map(page => readFile(resolve(ROOT, page), "utf8")));
const [home, salary, accounting, analytics] = contents;

for (const [index, page] of pages.entries()) {
  assert.ok(contents[index].includes("operations-icons.js"), `${page} 未載入共用分頁圖示庫`);
}
assert.ok(home.includes('data-icon="accounting"') && home.includes('data-icon="payroll"') && home.includes('data-icon="analytics"'), "首頁三大系統入口未使用一致圖示");
assert.ok(salary.includes('data-icon="dashboard"') && salary.includes('data-icon="attendance"') && salary.includes('data-icon="employees"'), "薪資分頁或手機選單圖示不完整");
assert.ok(accounting.includes('data-icon="entry"') && accounting.includes('data-icon="import"') && accounting.includes('data-icon="safety"'), "記帳分頁圖示不完整");
assert.ok(accounting.includes('data-icon="year"') && accounting.includes('data-icon="month"') && accounting.includes('data-icon="week"'), "年／月／週報表切換缺少圖示");
assert.ok(analytics.includes('data-icon="trend"') && analytics.includes('data-icon="channels"') && analytics.includes('data-icon="alerts"'), "分析分頁圖示不完整");

const icons = await readFile(resolve(ROOT, "shared/operations-icons.js"), "utf8");
assert.ok(icons.includes("window.BreakfastIcons"), "共用圖示庫未對前端公開");
assert.ok(icons.includes("operations-icon"), "共用圖示未使用一致 SVG 樣式");

console.log("系統分頁圖示驗證通過：首頁、薪資、記帳、分析與報表週期均已使用共用 SVG 圖示。");
