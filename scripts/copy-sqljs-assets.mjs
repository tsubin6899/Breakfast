import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = resolve(import.meta.dirname, "..");
const targetDirectory = resolve(projectRoot, "accounting", "vendor");
const javascriptSource = require.resolve("sql.js/dist/sql-wasm.js");
const wasmSource = resolve(dirname(javascriptSource), "sql-wasm.wasm");

await mkdir(targetDirectory, { recursive: true });
await Promise.all([
  copyFile(javascriptSource, resolve(targetDirectory, "sql-wasm.js")),
  copyFile(wasmSource, resolve(targetDirectory, "sql-wasm.wasm"))
]);

console.log("SQLite browser assets are ready.");
