import assert from "node:assert/strict";
import { build } from "esbuild";
import vm from "node:vm";

const output = await build({
  entryPoints: ["api/_lib/blob-store.ts"], bundle: true, platform: "node",
  format: "cjs", packages: "external", write: false
});
const headVersions = [];
const gets = [];
const puts = [];
let authoritativeEtag = '"storage-v1"';
const module = { exports: {} };
const sandbox = {
  module, exports: module.exports, Response, JSON, Error,
  require(name) {
    if (name === "node:zlib") return { gzipSync: () => { throw new Error("Unexpected gzip in ETag test"); } };
    assert.equal(name, "@vercel/blob");
    return {
      head: async () => ({ etag: headVersions.shift() || authoritativeEtag, url: "private://state" }),
      get: async (_path, options) => {
        gets.push(options);
        return { stream: new Response(JSON.stringify({ revision: "r1" })).body,
          blob: { etag: 'W/"delivery-v1"', url: "private://state" } };
      },
      put: async (path, body, options) => {
        puts.push({ path, body, options });
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
console.log("Blob storage ETag, uncached reads and concurrent-read protection checks passed.");
