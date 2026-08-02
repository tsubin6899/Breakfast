import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");
const directories = ["salary_app", "employee_portal", "accounting", "dashboard_cost", "shared"];
const files = ["index.html", "manifest.webmanifest", "service-worker.js", "offline.html", ".nojekyll"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const directory of directories) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}
for (const file of files) {
  await cp(resolve(root, file), resolve(output, file));
}
console.log(`Static site prepared in ${output}`);
