import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_NAME = "63a3f985-b2ed-4b72-b5a8-37829cb160cf-taiwan.csv";
const SOURCE_PATH = resolve(ROOT, "..", "初一食午營業額存檔", SOURCE_NAME);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const code = await readFile(resolve(ROOT, "accounting/uber-statement-importer.js"), "utf8");
const sandbox = { window: {}, crypto: webcrypto, TextDecoder, console };
vm.runInNewContext(code, sandbox, { filename: "accounting/uber-statement-importer.js" });
const importer = sandbox.window.BreakfastUberStatementImporter;
assert(importer, "Uber 對帳單匯入器未載入");

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
assert(first.summary.sourceRows === 135, "原始 Uber 明細應為 135 筆");
assert(first.summary.dailyRows === 9, "Uber 明細應彙總為 9 天");
assert(first.summary.statementNet === 20493, "Uber 對帳單淨收入應為 20,493 元");
assert(first.summary.serviceFees === -11167, "Uber 平台服務費應為 -11,167 元");
assert(first.summary.newDays === 9 && first.transactions.length === 9, "首次匯入應新增 9 天");

const second = await importer.analyzeFile({ file, transactions: first.transactions, importBatches: [] });
assert(second.summary.matchedDays === 9, "重複匯入應辨識 9 天同額資料");
assert(second.transactions.length === 0, "重複匯入不應新增資料");

const changed = first.transactions.map((row, index) => index === 0 ? { ...row, amount: row.amount + 1 } : row);
const replacement = await importer.analyzeFile({ file, transactions: changed, importBatches: [] });
assert(replacement.summary.replacedDays === 1, "同日不同額應標示 1 天取代舊值");
assert(replacement.transactions.length === 1 && replacement.replacedTransactionIds.length === 1, "取代模式應產生 1 筆新值並移除 1 筆舊值");

console.log("Uber CSV 匯入驗證通過：135 筆彙總 9 天、淨收入 20,493 元；重複匯入 0 筆；同日異額可安全取代。");
