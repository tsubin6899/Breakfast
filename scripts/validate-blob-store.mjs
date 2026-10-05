import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";
import { gzipSync, gunzipSync } from "node:zlib";
import { BlobError, BlobNotFoundError, BlobAccessError } from "@vercel/blob";

const output = await build({
  entryPoints: ["api/_lib/blob-store.ts"], bundle: true, platform: "node",
  format: "cjs", packages: "external", write: false
});
const headVersions = [];
const gets = [];
const puts = [];
let authoritativeEtag = '"storage-v1"';
let headError;
let putError;
const module = { exports: {} };
const sandbox = {
  module, exports: module.exports, Response, JSON, Error,
  require(name) {
    if (name === "node:zlib") return { gzipSync };
    assert.equal(name, "@vercel/blob");
    return {
      BlobNotFoundError,
      head: async () => {
        if (headError) throw headError;
        return { etag: headVersions.shift() || authoritativeEtag, url: "private://state" };
      },
      get: async (_path, options) => {
        gets.push(options);
        return { stream: new Response(JSON.stringify({ revision: "r1" })).body,
          blob: { etag: 'W/"delivery-v1"', url: "private://state" } };
      },
      put: async (path, body, options) => {
        puts.push({ path, body, options });
        if (putError) throw putError;
        if (path.includes("workspace-daily/")) return { etag: '"backup"' };
        if (options.ifMatch !== authoritativeEtag) throw new Error("ETag mismatch");
        return { etag: '"storage-v2"' };
      }
    };
  }
};
vm.runInNewContext(output.outputFiles[0].text, sandbox);
const store = module.exports;
const stored = await store.readJson("state.json");
assert.equal(stored.etag, authoritativeEtag, "Conditional writes must use the storage ETag rather than a delivery representation ETag");
assert.equal(gets[0].useCache, false);
assert.equal(gets[0].headers["accept-encoding"], "identity");
await store.writeJson("state.json", { revision: "r2" }, { overwrite: true, etag: stored.etag });
assert.equal(puts[0].options.allowOverwrite, true);
assert.equal(puts[0].options.ifMatch, authoritativeEtag);
headVersions.push('"old"', '"new"', '"stable"', '"stable"');
const reread = await store.readJson("state.json");
assert.equal(reread.etag, '"stable"', "A concurrent change while downloading must trigger a fresh read");
headVersions.push('"1"', '"2"', '"3"', '"4"', '"5"', '"6"');
await assert.rejects(store.readJson("state.json"), /BLOB_CHANGED_DURING_READ/);
headError = new BlobNotFoundError();
assert.equal(headError.name, "Error", "SDK errors inherit the generic Error name");
assert.equal(await store.readJson("missing.json"), null);
const backupState = { revision: "before-update", modules: {} };
await store.writeDailyWorkspaceBackup("2026-10-04T18:00:00Z", backupState);
const backup = puts.at(-1);
assert.equal(backup.path, "breakfast/backups/workspace-daily/2026-10-05.json.gz");
assert.equal(gunzipSync(backup.body).toString(), JSON.stringify(backupState));
assert.equal(backup.options.allowOverwrite, false);
putError = new BlobError("This blob already exists, use allowOverwrite to overwrite it.");
assert.equal(await store.writeDailyWorkspaceBackup("2026-10-04T18:00:00Z", backupState), null);
assert.equal(await store.writeImmutableJson("snapshot.json", backupState), null);
putError = undefined;
headError = new BlobAccessError();
await assert.rejects(store.readJson("state.json"), BlobAccessError);
await assert.rejects(store.writeDailyWorkspaceBackup("2026-10-04T18:00:00Z", backupState), BlobAccessError);
headError = undefined;
const putCount = puts.length;
assert.equal(await store.writeDailyWorkspaceBackup("2026-10-04T18:00:00Z", backupState), null);
assert.equal(puts.length, putCount, "An existing daily backup must not be overwritten");
console.log("Blob storage ETag, uncached reads and concurrent-read protection checks passed.");
