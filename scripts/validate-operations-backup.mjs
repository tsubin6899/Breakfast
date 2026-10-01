import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const values = new Map();
let failKey = "";
const snapshots = [];
const sandbox = {
  Blob, Date, Map, Object, Array, JSON, Error, Number,
  localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      if (key === failKey) { failKey = ""; throw new Error("quota"); }
      values.set(key, value);
    },
    removeItem: key => values.delete(key)
  },
  CustomEvent: class { constructor(name) { this.type = name; } },
  window: {
    BREAKFAST_ACCOUNTING_HISTORY_2026: { transactions: [{ id: "history", date: "2026-01-01", type: "income", amount: 10 }] },
    BreakfastOperationsStore: { createSnapshot: async (module, payload) => snapshots.push({ module, payload }) },
    dispatchEvent() {}
  }
};
vm.runInNewContext(await readFile(new URL("../shared/accounting-storage.js", import.meta.url), "utf8"), sandbox);
vm.runInNewContext(await readFile(new URL("../shared/operations-backup.js", import.meta.url), "utf8"), sandbox);
const backup = sandbox.window.BreakfastOperationsBackup;
values.set(backup.KEYS.accounting, JSON.stringify({ version: 7, transactions: [{ id: "new", amount: 30 }], dayLabor: [], storageMode: "bundled-history-delta-v1" }));
values.set(backup.KEYS.payroll, JSON.stringify({ settings: { month: "2026-09" }, employees: [{ id: "employee" }], attendance: { day: { start: "06:00" } } }));
const bundle = backup.validate(backup.collect());
assert.equal(bundle.modules.accounting.transactions.length, 2, "The export must contain bundled history and local entries");
assert.equal(bundle.modules.payroll.attendance.day.start, "06:00");
assert.throws(() => backup.validate({ format: "wrong" }));
assert.throws(() => backup.validate({ ...bundle, modules: { ...bundle.modules, payroll: {} } }));
const original = JSON.stringify([...values]);
failKey = backup.KEYS.payroll;
await assert.rejects(backup.apply(bundle.modules), /quota/);
assert.equal(JSON.stringify([...values]), original, "A failure during restore must roll back both modules and their metadata");
await backup.apply(bundle.modules);
assert.equal(JSON.parse(values.get(backup.metaKey("payroll"))).dirty, true);
assert.equal(snapshots.length, 2, "Every restore should retain the previous combined version");
assert.equal(JSON.parse(values.get(backup.KEYS.payroll)).employees.length, 1);
console.log("Unified operations backup, validation, restore and rollback checks passed.");
