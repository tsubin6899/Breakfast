import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_NAME = "20260715_200102892078.xlsx";
const SOURCE_PATH = resolve("C:\\Users\\TNUA-BIN\\Downloads\\payoutArchive_630007373001_20260727", SOURCE_NAME);

if (!await access(SOURCE_PATH).then(() => true).catch(() => false)) {
  console.log(`略過 foodpanda XLSX 實檔回歸測試：找不到選用測試檔 ${SOURCE_NAME}。`);
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const importerCode = await readFile(resolve(ROOT, "accounting/foodpanda-statement-importer.js"), "utf8");
const sandbox = { window: {}, crypto: webcrypto, TextDecoder, Blob, Response, DecompressionStream, console };
vm.runInNewContext(importerCode, sandbox, { filename: "accounting/foodpanda-statement-importer.js" });
const importer = sandbox.window.BreakfastFoodpandaStatementImporter;
assert(importer, "foodpanda 對帳單匯入器未載入");

const historyCode = await readFile(resolve(ROOT, "accounting/data/revenue-history-2026.js"), "utf8");
const historySandbox = { window: {} };
vm.runInNewContext(historyCode, historySandbox, { filename: "accounting/data/revenue-history-2026.js" });
const historyTransactions = historySandbox.window.BREAKFAST_ACCOUNTING_HISTORY_2026.transactions;

const [bytes, info] = await Promise.all([readFile(SOURCE_PATH), stat(SOURCE_PATH)]);
const file = {
  name: SOURCE_NAME,
  size: bytes.length,
  lastModified: info.mtimeMs,
  async arrayBuffer() {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
};

const first = await importer.analyzeFile({ file, transactions: [], importBatches: [] });
assert(first.summary.sourceRows === 350, "foodpanda 原始訂單應為 350 筆");
assert(first.summary.dailyRows === 13, "foodpanda 訂單應彙總為 13 天");
assert(first.summary.statementNet === 47604, "foodpanda 每日淨收入合計應為 47,604 元");
assert(first.summary.periodFees === 300, "foodpanda 整期平台費應為 300 元");
assert(first.summary.estimatedPayout === 47304, "foodpanda 預估撥款應為 47,304 元");
assert(first.summary.duplicateOrderRows === 0, "foodpanda 對帳單不應有重複訂單編號");
assert(first.transactions.length === 13 && first.summary.newDays === 13, "空白系統應新增 13 天 foodpanda 收入");
assert(first.transactions.every(row => row.category === "Foodpanda外送" && row.group === "平台收入"), "foodpanda 匯入名稱應統一為 Foodpanda外送並歸入平台收入");

const matched = await importer.analyzeFile({ file, transactions: historyTransactions, importBatches: [] });
assert(matched.summary.matchedDays === 13, "既有 Key-in 應有 13 天與 foodpanda 對帳單相符");
assert(matched.summary.replacedDays === 0 && matched.transactions.length === 0, "金額全數一致時不應重複匯入");
assert(matched.auditRows.every(row => Math.abs(row.amount - row.existingAmount) < .01), "每一天 Key-in 與對帳單差額都應為 0");

const targetDate = matched.auditRows[0].date;
const changed = historyTransactions.map(row => row.date === targetDate && row.type === "income" && /foodpanda|熊貓/i.test(`${row.category}${row.counterparty || ""}`)
  ? { ...row, amount: Number(row.amount || 0) + 1 }
  : row);
const replacement = await importer.analyzeFile({ file, transactions: changed, importBatches: [] });
assert(replacement.summary.replacedDays === 1, "同日異額時應標記 1 天取代舊值");
assert(replacement.transactions.length === 1 && replacement.replacedTransactionIds.length === 1, "取代時應建立 1 筆新資料並移除 1 筆舊資料");

const repeated = await importer.analyzeFile({ file, transactions: historyTransactions, importBatches: [{ kind: "foodpanda-statement", fingerprint: first.file.fingerprint, importedAt: "2026-08-02T00:00:00.000Z" }] });
assert(repeated.previousBatch, "同一份 foodpanda 檔案應辨認既有匯入批次");

console.log("foodpanda XLSX 匯入驗證通過：350 筆彙總 13 天、淨收入 47,604 元、期租費 300 元；既有 Key-in 13 天全數一致。 ");
