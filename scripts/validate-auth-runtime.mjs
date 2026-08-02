import { build } from "esbuild";

const result = await build({
  entryPoints: ["api/_lib/auth.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  packages: "external",
  write: false,
  logLevel: "silent"
});

const output = result.outputFiles.map(file => file.text).join("\n");
if (/require\(["']jose["']\)/.test(output)) {
  throw new Error("Auth runtime regression: jose was converted to CommonJS require().");
}
if (!/import\(["']jose["']\)/.test(output)) {
  throw new Error("Auth runtime validation could not find the dynamic jose import.");
}

console.log("登入執行環境驗證通過：CommonJS 打包仍保留 jose 動態載入。");
