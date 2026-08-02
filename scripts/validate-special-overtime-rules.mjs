import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const code = await readFile(resolve(root, "salary_app/special-overtime-rules.js"), "utf8");
const sandbox = {};
vm.runInNewContext(code, sandbox, { filename: "special-overtime-rules.js" });
const rulesApi = sandbox.BREAKFAST_SPECIAL_OVERTIME;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rules = rulesApi.rulesForEmployee({ id: "he" });
const base = { expected: true, start: "08:00", end: "15:00", source: "weekly" };
const cases = [
  ["2026-07-11", "08:00", "7/11 尚未進入每月 12 日規則"],
  ["2026-07-13", "11:30", "7/13 星期一應從 11:30 起算"],
  ["2026-07-14", "08:00", "7/14 星期二應使用一般班表"],
  ["2026-08-12", "11:30", "8/12 星期三應從 11:30 起算"],
  ["2026-08-14", "11:30", "8/14 星期五應從 11:30 起算"],
  ["2026-08-15", "08:00", "8/15 星期六應使用一般班表"]
];

for (const [date, expectedStart, message] of cases) {
  const schedule = rulesApi.applyRule(base, rules, date);
  assert(schedule.start === expectedStart, `${message}，實際為 ${schedule.start}`);
}

const specialMinutes = (11 * 60 + 30) - (8 * 60);
assert(specialMinutes === 210, "08:00～11:30 應為 210 分鐘");
assert(specialMinutes / 60 * 200 === 700, "210 分鐘、每小時 200 元應為 700 元");
console.log("特殊加班規則驗證通過：7、8 月日期範圍、週一三五與 210 分鐘案例皆正確。");
