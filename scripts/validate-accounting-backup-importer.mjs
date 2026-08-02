import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import initSqlJs from "sql.js";

const ROOT = resolve(import.meta.dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadBrowserData(path, property) {
  const sandbox = { window: {} };
  vm.runInNewContext(await readFile(resolve(ROOT, path), "utf8"), sandbox, { filename: path });
  return sandbox.window[property];
}

const backupPath = resolve(ROOT, "..", "初一食午營業額存檔", "初一食午_20260801233314.back");
const backupBuffer = await readFile(backupPath);
const sourceFile = {
  name: "初一食午_20260801233314.back",
  size: backupBuffer.length,
  async arrayBuffer() {
    return backupBuffer.buffer.slice(backupBuffer.byteOffset, backupBuffer.byteOffset + backupBuffer.byteLength);
  }
};

const sqlWasm = resolve(ROOT, "accounting", "vendor", "sql-wasm.wasm");
const sandbox = {
  console,
  crypto: webcrypto,
  URL,
  Uint8Array,
  DataView,
  Set,
  Map,
  Date,
  Math,
  Number,
  String,
  Array,
  Promise,
  window: {
    location: { href: "http://127.0.0.1:4173/accounting/" },
    initSqlJs() {
      return initSqlJs({ locateFile: () => sqlWasm });
    }
  }
};
vm.runInNewContext(await readFile(resolve(ROOT, "accounting", "backup-importer.js"), "utf8"), sandbox, { filename: "accounting/backup-importer.js" });
const importer = sandbox.window.BreakfastAccountingBackupImporter;
assert(importer, "記帳備份匯入模組未載入");

const workbook = await loadBrowserData("accounting/data/revenue-history-2026.js", "BREAKFAST_ACCOUNTING_HISTORY_2026");
const bundledBackup = await loadBrowserData("accounting/data/accounting-backup-2026-07-22.js", "BREAKFAST_ACCOUNTING_BACKUP_2026_07_22");

const firstImport = await importer.analyzeFile({
  file: sourceFile,
  startDate: "2026-07-22",
  transactions: workbook.transactions,
  importBatches: []
});
assert(firstImport.summary.eligibleRows === 103, "有效收支應為 103 筆");
assert(firstImport.summary.matchedRows === 13, "活頁簿應對上 13 筆");
assert(firstImport.summary.importedRows === 90, "首次應新增 90 筆");
assert(firstImport.summary.transferRows === 20, "應排除 20 筆帳戶互轉");
assert(firstImport.summary.adjustmentRows === 3, "應排除 3 筆餘額調整");
assert(firstImport.summary.importedIncome === 299488, "新增收入合計不符");
assert(firstImport.summary.importedExpense === 207127, "新增支出合計不符");

const repeatedImport = await importer.analyzeFile({
  file: sourceFile,
  startDate: "2026-07-22",
  transactions: [...workbook.transactions, ...bundledBackup.transactions],
  importBatches: [{ fingerprint: firstImport.file.fingerprint, importedAt: "2026-08-02T00:00:00.000Z" }]
});
assert(repeatedImport.summary.eligibleRows === 103, "重複分析仍應讀到 103 筆有效收支");
assert(repeatedImport.summary.matchedRows === 103, "同檔重複匯入時全部資料都應判定已存在");
assert(repeatedImport.summary.importedRows === 0, "同檔重複匯入不得新增資料");
assert(repeatedImport.previousBatch, "同檔重複匯入應顯示既有匯入批次");

console.log("記帳 .back 匯入驗證通過：首次新增 90 筆；重複匯入新增 0 筆；20 筆互轉與 3 筆餘額調整均排除。");
