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

console.log("雲端同步重試、衝突與離線保護檢查完成。");
