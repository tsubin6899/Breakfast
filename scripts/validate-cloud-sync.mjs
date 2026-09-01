import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const ROOT = resolve(import.meta.dirname, "..");
const source = await readFile(resolve(ROOT, "shared/cloud-sync.js"), "utf8");
const calls = [];
const responses = [];
const sandbox = {
  AbortController,
  Date,
  Error,
  navigator: { onLine: true },
  fetch: async (...args) => {
    calls.push(args);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  },
  window: {
    setTimeout: callback => { callback(); return 1; },
    clearTimeout: () => {}
  }
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(source, sandbox, { filename: "shared/cloud-sync.js" });

const cloud = sandbox.window.BreakfastCloudSync;
assert.ok(cloud, "共用雲端同步模組未載入");
assert.equal(cloud.isRetryable({ status: 500 }), true, "伺服器錯誤應可自動重試");
assert.equal(cloud.isRetryable({ status: 409 }), false, "版本衝突不得自動覆蓋重試");
assert.equal(cloud.decideSync(
  { dirty: true, revision: "local-old", lastLocalChangeAt: "2026-08-01T08:00:00.000Z" },
  { state: {}, revision: "remote-new", updatedAt: "2026-08-01T09:00:00.000Z" }
), "download", "登入後雲端時間較新時應自動下載");
assert.equal(cloud.decideSync(
  { dirty: true, revision: "local-old", lastLocalChangeAt: "2026-08-01T10:00:00.000Z" },
  { state: {}, revision: "remote-new", updatedAt: "2026-08-01T09:00:00.000Z" }
), "upload", "登入後本機時間較新時應自動上傳");
assert.equal(cloud.decideSync(
  { dirty: false, revision: "same", lastLocalChangeAt: "" },
  { state: {}, revision: "same", updatedAt: "2026-08-01T09:00:00.000Z" }
), "current", "相同版本且無本機變更時不得重複同步");

responses.push(
  { ok: false, status: 500, json: async () => ({ message: "暫時失敗" }) },
  { ok: true, status: 200, json: async () => ({ ok: true, revision: "r2" }) }
);
const retryResult = await cloud.requestJson("/api/test", { attempts: 2 });
assert.equal(retryResult.revision, "r2", "短暫失敗後應取得成功結果");
assert.equal(calls.length, 2, "短暫伺服器錯誤應重試一次");

responses.push({ ok: false, status: 409, json: async () => ({ error: "REVISION_CONFLICT", revision: "remote" }) });
await assert.rejects(
  () => cloud.requestJson("/api/test", { attempts: 3 }),
  error => error.status === 409 && error.code === "REVISION_CONFLICT" && error.payload.revision === "remote"
);
assert.equal(calls.length, 3, "版本衝突不得重試");

sandbox.navigator.onLine = false;
await assert.rejects(() => cloud.requestJson("/api/test"), error => error.code === "OFFLINE");
assert.equal(calls.length, 3, "離線時不得送出網路請求");

const [accountingApp, payrollApp, accountingHtml, workspaceApi] = await Promise.all([
  readFile(resolve(ROOT, "accounting/app.js"), "utf8"),
  readFile(resolve(ROOT, "salary_app/app.js"), "utf8"),
  readFile(resolve(ROOT, "accounting/index.html"), "utf8"),
  readFile(resolve(ROOT, "api/operations-workspace.ts"), "utf8")
]);
assert.ok(accountingApp.includes("manualAccountingCloudSync"), "手動同步未先確認雲端最新版本");
assert.ok(accountingApp.includes("resolveAccountingCloudConflict"), "版本衝突選擇未集中處理");
assert.ok(accountingApp.includes('syncAccountingCloud({ baseRevision: remote.revision || "" })'), "採用本機資料前未取得最新雲端版本號");
assert.ok(!accountingApp.includes("syncAccountingCloud({ force: true })"), "衝突處理不應依賴僅店主可用的強制覆蓋");
assert.ok(accountingApp.includes("CLOUD_SYNC.decideSync(meta, remote)"), "記帳登入後未依版本時間自動判斷同步方向");
assert.ok(accountingApp.includes("/api/operations-workspace?module=accounting"), "記帳尚未改用共用營運雲端資料包");
assert.ok(payrollApp.includes("/api/operations-workspace?module=payroll"), "薪資尚未改用共用營運雲端資料包");
assert.ok(payrollApp.includes("CLOUD_SYNC.decideSync(meta, result)"), "薪資登入後未依版本時間自動判斷同步方向");
assert.ok(workspaceApi.includes('const WORKSPACE_PATH = "breakfast/state/operations-workspace-current.json"'), "共用營運雲端資料包路徑未建立");
assert.ok(workspaceApi.includes("LEGACY_ACCOUNTING_PATH") && workspaceApi.includes("LEGACY_PAYROLL_PATH"), "舊薪資與記帳雲端資料未納入遷移");
assert.ok(accountingHtml.includes('id="accounting-cloud-conflict-detail"'), "版本衝突未顯示本機與雲端時間資訊");

console.log("共用營運資料包、登入版本判斷、同步重試、衝突與離線保護檢查完成。");
