const assert = require('node:assert/strict');
const vm = require('node:vm');
const zlib = require('node:zlib');
const {build} = require('esbuild');
(async () => {
  const result = await build({entryPoints:['api/_lib/blob-store.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',write:false});
  let exists = false, fail = false, race = false;
  const puts = [], module = {exports:{}};
  vm.runInNewContext(result.outputFiles[0].text, {module,exports:module.exports,Response,require(name){
    if(name === 'node:zlib') return zlib;
    assert.equal(name,'@vercel/blob');
    return {head:async()=>{if(fail) throw Error('unauthorized'); if(!exists) {let e=Error('missing');e.status=404;throw e;} return {};},put:async(path,body,options)=>{if(race){let e=Error('exists');e.status=409;throw e;} puts.push({path,body,options}); exists=true;return {};}};
  }});
  const save = module.exports.writeDailyWorkspaceBackup;
  const data = {revision:'recovery',rows:Array(1000).fill({a:'example',b:123})};
  await save('2026-10-01T17:00:00Z',data);
  assert.equal(puts[0].path,'breakfast/backups/workspace-daily/2026-10-02.json.gz');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(puts[0].body)),data);
  assert.equal(puts[0].options.allowOverwrite,false);
  await save('2026-10-02T10:00:00Z',{revision:'later'});
  assert.equal(puts.length,1);
  exists=false;race=true;await save('2026-10-03T00:00:00Z',data);
  fail=true;await assert.rejects(save('2026-10-04T00:00:00Z',data),/unauthorized/);
  console.log('PASS: Taiwan daily boundary, gzip round trip, daily deduplication, concurrent creation, error propagation.');
  console.log('Example bytes:',Buffer.byteLength(JSON.stringify(data)),'->',puts[0].body.length);
})().catch(e=>{console.error(e);process.exit(1);});
