import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const files = [
  "accounting/data/revenue-history-2022-2025.js",
  "accounting/data/revenue-history-2026.js",
  "accounting/data/accounting-backup-2026-07-22.js",
  "accounting/data/uber-statement-2026-07-24.js",
  "shared/accounting-storage.js"
];
const sources = await Promise.all(files.map(file => readFile(resolve(ROOT, file), "utf8")));
const values = new Map();
const quota = 5_000_000;
const localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) {
    const next = new Map(values);
    next.set(key, String(value));
    const size = [...next.entries()].reduce((sum, [itemKey, itemValue]) => sum + Buffer.byteLength(itemKey + itemValue), 0);
    if (size > quota) {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    }
    values.set(key, String(value));
  }
};
const sandbox = { window: {}, Blob, localStorage };
sources.forEach((source, index) => vm.runInNewContext(source, sandbox, { filename: files[index] }));
const storage = sandbox.window.BreakfastAccountingStorage;
assert(storage, "帳務精簡儲存模組未正確載入");

const bundled = [
  sandbox.window.BREAKFAST_ACCOUNTING_HISTORY_2022_2025,
  sandbox.window.BREAKFAST_ACCOUNTING_HISTORY_2026,
  sandbox.window.BREAKFAST_ACCOUNTING_BACKUP_2026_07_22,
  sandbox.window.BREAKFAST_UBER_STATEMENT_2026_07_24
].flatMap(item => item?.transactions || []);
assert(bundled.length > 16000, "測試未載入完整歷史帳務");
const dynamic = { id: "manual-test", date: "2026-08-31", type: "income", group: "現金收入", category: "現金營業收入", amount: 1234 };
const state = { version: 7, selectedMonth: "2026-08", transactions: [...bundled, dynamic], dayLabor: [], auditLog: [], undoLog: [] };
const fullBytes = Buffer.byteLength(JSON.stringify(state));
assert(fullBytes > quota, "完整歷史資料應能重現 localStorage 超額問題");

const result = storage.persist("breakfast-accounting-v1", state, bundled);
assert(result.bytes < 1_000_000, `精簡後資料仍過大：${result.bytes} bytes`);
assert(result.compact.transactions.length === 1 && result.compact.transactions[0].id === dynamic.id, "內建歷史未正確排除或新增記帳遺失");
const hydrated = storage.hydrateTransactions(result.compact.transactions, bundled, { deletedIds: result.compact.historyDeletedIds });
assert(hydrated.length === state.transactions.length, "精簡資料無法還原完整帳務");
assert(result.compact.localSummaries["2026-08"].income > 0, "月份摘要未保留首頁所需收入");
const repeated = storage.compactState(result.compact, bundled);
assert(repeated.transactions.length === 1 && repeated.historyDeletedIds.length === 0, "再次精簡時誤將內建歷史判定為已刪除");

const deletedId = String(bundled[0].id);
const withoutOne = { ...state, transactions: state.transactions.filter(item => String(item.id) !== deletedId) };
const deletedCompact = storage.compactState(withoutOne, bundled);
assert(deletedCompact.historyDeletedIds.includes(deletedId), "歷史刪除標記未保留");
const deletedHydrated = storage.hydrateTransactions(deletedCompact.transactions, bundled, { deletedIds: deletedCompact.historyDeletedIds });
assert(!deletedHydrated.some(item => String(item.id) === deletedId), "已刪除歷史記帳被錯誤還原");

const [accountingHtml, dashboardHtml, accountingApp, dashboardApp, homeApp] = await Promise.all([
  readFile(resolve(ROOT, "accounting/index.html"), "utf8"),
  readFile(resolve(ROOT, "dashboard_cost/index.html"), "utf8"),
  readFile(resolve(ROOT, "accounting/app.js"), "utf8"),
  readFile(resolve(ROOT, "dashboard_cost/app.js"), "utf8"),
  readFile(resolve(ROOT, "shared/home.js"), "utf8")
]);
assert(accountingHtml.includes("/shared/accounting-storage.js") || accountingHtml.includes("../shared/accounting-storage.js"), "記帳頁未載入精簡儲存模組");
assert(dashboardHtml.includes("accounting-storage.js"), "分析頁未載入精簡儲存模組");
assert(accountingApp.includes("persistAccountingState") && dashboardApp.includes("ACCOUNTING_STORAGE.persist"), "整份帳務仍可能直接寫入 localStorage");
assert(homeApp.includes("localSummaries"), "首頁未改用精簡月份摘要");

console.log(`帳務容量驗證通過：完整 ${fullBytes.toLocaleString()} bytes，精簡後 ${result.bytes.toLocaleString()} bytes。`);
