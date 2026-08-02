(() => {
  "use strict";

  const STORAGE_KEY = "breakfast-operations-hub-v1";
  const GLOBAL_MONTH_KEY = "breakfast-global-month-v1";
  const SNAPSHOT_META_KEY = "breakfast-snapshot-meta-v1";
  const DB_NAME = "breakfast-operations-recovery-v1";
  const DB_VERSION = 1;
  const SNAPSHOT_STORE = "snapshots";
  const SNAPSHOT_LIMIT = 30;

  function emptyStore() {
    return { version: 2, updatedAt: "", modules: {} };
  }

  function safeParse(value, fallback = null) {
    try { return JSON.parse(value); }
    catch { return fallback; }
  }

  function read() {
    const value = safeParse(localStorage.getItem(STORAGE_KEY) || "null");
    return value && typeof value === "object"
      ? { ...emptyStore(), ...value, version: 2, modules: value.modules && typeof value.modules === "object" ? value.modules : {} }
      : emptyStore();
  }

  function publish(moduleName, payload) {
    const store = read();
    const updatedAt = new Date().toISOString();
    store.updatedAt = updatedAt;
    store.modules[moduleName] = { updatedAt, payload };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    window.dispatchEvent(new CustomEvent("breakfast-operations-update", { detail: { moduleName, updatedAt } }));
    return store.modules[moduleName];
  }

  function moduleData(moduleName) {
    return read().modules[moduleName]?.payload || null;
  }

  function getGlobalMonth(fallback = "") {
    const month = localStorage.getItem(GLOBAL_MONTH_KEY) || "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : fallback;
  }

  function setGlobalMonth(month, source = "unknown") {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || "")) return false;
    localStorage.setItem(GLOBAL_MONTH_KEY, month);
    window.dispatchEvent(new CustomEvent("breakfast-global-month", { detail: { month, source } }));
    return true;
  }

  function subscribe(listener) {
    const localHandler = event => listener(event.detail || {});
    const monthHandler = event => listener({ moduleName: "global-month", ...(event.detail || {}) });
    const storageHandler = event => {
      if (event.key === STORAGE_KEY) listener({ moduleName: "external", updatedAt: new Date().toISOString() });
      if (event.key === GLOBAL_MONTH_KEY) listener({ moduleName: "global-month", month: getGlobalMonth(), source: "external" });
    };
    window.addEventListener("breakfast-operations-update", localHandler);
    window.addEventListener("breakfast-global-month", monthHandler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("breakfast-operations-update", localHandler);
      window.removeEventListener("breakfast-global-month", monthHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }

  function openRecoveryDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("INDEXED_DB_UNAVAILABLE")); return; }
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: "id" });
          store.createIndex("module-created", ["moduleName", "createdAt"], { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("INDEXED_DB_OPEN_FAILED"));
    });
  }

  async function withSnapshotStore(mode, operation) {
    const db = await openRecoveryDb();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction(SNAPSHOT_STORE, mode);
        const store = transaction.objectStore(SNAPSHOT_STORE);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error("SNAPSHOT_TRANSACTION_FAILED"));
        transaction.onabort = () => reject(transaction.error || new Error("SNAPSHOT_TRANSACTION_ABORTED"));
        result = operation(store, transaction);
      });
    } finally {
      db.close();
    }
  }

  async function listSnapshots(moduleName = "") {
    const rows = await withSnapshotStore("readonly", store => new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    }));
    return rows
      .filter(item => !moduleName || item.moduleName === moduleName)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(({ payload, ...summary }) => summary);
  }

  async function pruneSnapshots(moduleName, keep = SNAPSHOT_LIMIT) {
    const rows = await listSnapshots(moduleName);
    const expired = rows.slice(Math.max(1, keep));
    if (!expired.length) return;
    await withSnapshotStore("readwrite", store => {
      expired.forEach(item => store.delete(item.id));
    });
  }

  async function createSnapshot(moduleName, payload, options = {}) {
    if (!moduleName || payload === undefined) throw new Error("INVALID_SNAPSHOT");
    const createdAt = new Date().toISOString();
    const serialized = JSON.stringify(payload);
    const record = {
      id: `${moduleName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      moduleName,
      createdAt,
      label: options.label || "手動安全快照",
      reason: options.reason || "",
      actor: options.actor || "本機使用者",
      size: new Blob([serialized]).size,
      summary: options.summary || {},
      payload: safeParse(serialized, payload)
    };
    await withSnapshotStore("readwrite", store => store.put(record));
    await pruneSnapshots(moduleName, Number(options.keep || SNAPSHOT_LIMIT));
    const meta = safeParse(localStorage.getItem(SNAPSHOT_META_KEY) || "{}", {}) || {};
    meta[moduleName] = createdAt;
    localStorage.setItem(SNAPSHOT_META_KEY, JSON.stringify(meta));
    window.dispatchEvent(new CustomEvent("breakfast-snapshot-update", { detail: { moduleName, id: record.id, createdAt } }));
    const { payload: ignored, ...summary } = record;
    return summary;
  }

  async function autoSnapshot(moduleName, payload, options = {}) {
    try {
      const meta = safeParse(localStorage.getItem(SNAPSHOT_META_KEY) || "{}", {}) || {};
      const previous = Date.parse(meta[moduleName] || "");
      const minimumHours = Number(options.minimumHours || 20);
      if (Number.isFinite(previous) && Date.now() - previous < minimumHours * 60 * 60 * 1000) return null;
      return await createSnapshot(moduleName, payload, {
        ...options,
        label: options.label || "每日自動快照",
        reason: options.reason || "系統每日自動建立"
      });
    } catch (error) {
      console.warn("Unable to create automatic snapshot", error);
      return null;
    }
  }

  async function getSnapshot(id) {
    return withSnapshotStore("readonly", store => new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    }));
  }

  async function deleteSnapshot(id) {
    await withSnapshotStore("readwrite", store => store.delete(id));
    window.dispatchEvent(new CustomEvent("breakfast-snapshot-update", { detail: { id, deleted: true } }));
  }

  window.BreakfastOperationsStore = {
    key: STORAGE_KEY,
    globalMonthKey: GLOBAL_MONTH_KEY,
    read,
    publish,
    moduleData,
    subscribe,
    getGlobalMonth,
    setGlobalMonth,
    createSnapshot,
    autoSnapshot,
    listSnapshots,
    getSnapshot,
    deleteSnapshot
  };
})();
