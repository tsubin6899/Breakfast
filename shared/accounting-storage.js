(() => {
  "use strict";

  const textBytes = value => new Blob([String(value || "")]).size;

  function normalizeRows(rows, normalizeTransaction) {
    const normalize = typeof normalizeTransaction === "function" ? normalizeTransaction : item => ({ ...item });
    return (Array.isArray(rows) ? rows : []).map(item => normalize(item));
  }

  function transactionSignature(item) {
    return JSON.stringify(item || {});
  }

  function bundledIndex(bundledTransactions, normalizeTransaction) {
    const rows = normalizeRows(bundledTransactions, normalizeTransaction);
    return {
      rows,
      byId: new Map(rows.filter(item => item?.id).map(item => [String(item.id), item])),
      signatures: new Map(rows.filter(item => item?.id).map(item => [String(item.id), transactionSignature(item)]))
    };
  }

  function hydrateTransactions(savedTransactions, bundledTransactions, options = {}) {
    const index = bundledIndex(bundledTransactions, options.normalizeTransaction);
    const rows = normalizeRows(savedTransactions, options.normalizeTransaction);
    const existing = new Set(rows.map(item => String(item?.id || "")).filter(Boolean));
    const deleted = new Set((options.deletedIds || []).map(String));
    index.rows.forEach(item => {
      const id = String(item?.id || "");
      if (id && !existing.has(id) && !deleted.has(id)) rows.push(item);
    });
    return rows;
  }

  function buildLocalSummaries(state) {
    const months = {};
    (state?.transactions || []).forEach(item => {
      const month = String(item?.date || "").slice(0, 7);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
      const summary = months[month] ||= { income: 0, expense: 0, transactionCount: 0, unclassified: 0, expenseGroups: {}, incomeItemsByDay: {} };
      const amount = Number(item?.amount || 0);
      summary.transactionCount += 1;
      if (!item?.group || !item?.category || /未分類/.test(`${item?.group || ""}${item?.category || ""}`)) summary.unclassified += 1;
      if (item.type === "income") {
        summary.income += amount;
        const day = String(item.date).slice(8, 10);
        const name = String(item.category || item.counterparty || item.group || "");
        const items = summary.incomeItemsByDay[day] ||= [];
        if (name && !items.includes(name)) items.push(name);
      } else if (item.type === "expense") {
        summary.expense += amount;
        const group = String(item.group || "其他支出");
        summary.expenseGroups[group] = (summary.expenseGroups[group] || 0) + amount;
      }
    });
    return months;
  }

  function compactState(state, bundledTransactions, options = {}) {
    const index = bundledIndex(bundledTransactions, options.normalizeTransaction);
    const savedRows = Array.isArray(state?.transactions) ? state.transactions : [];
    const currentRows = state?.storageMode === "bundled-history-delta-v1"
      ? hydrateTransactions(savedRows, bundledTransactions, { normalizeTransaction: options.normalizeTransaction, deletedIds: state.historyDeletedIds })
      : savedRows;
    const presentBundledIds = new Set();
    const storedRows = [];
    currentRows.forEach(item => {
      const id = String(item?.id || "");
      const bundled = id ? index.byId.get(id) : null;
      if (!bundled) {
        storedRows.push(item);
        return;
      }
      presentBundledIds.add(id);
      if (transactionSignature(item) !== index.signatures.get(id)) storedRows.push(item);
    });
    const deletedIds = [...index.byId.keys()].filter(id => !presentBundledIds.has(id));
    return {
      ...state,
      version: Math.max(7, Number(state?.version || 0)),
      transactions: storedRows,
      historyDeletedIds: deletedIds,
      localSummaries: buildLocalSummaries({ ...state, transactions: currentRows }),
      storageMode: "bundled-history-delta-v1"
    };
  }

  function persist(key, state, bundledTransactions, options = {}) {
    const compact = compactState(state, bundledTransactions, options);
    const serialized = JSON.stringify(compact);
    try {
      localStorage.setItem(key, serialized);
    } catch (error) {
      if (error?.name !== "QuotaExceededError" && error?.code !== 22 && error?.code !== 1014) throw error;
      const emergency = { ...compact, auditLog: (compact.auditLog || []).slice(0, 80), undoLog: [] };
      const fallback = JSON.stringify(emergency);
      try {
        localStorage.setItem(key, fallback);
        return { compact: emergency, bytes: textBytes(fallback), reduced: true };
      } catch {
        const storageError = new Error("瀏覽器儲存空間仍不足，請先下載備份後移除過大的收據照片。");
        storageError.code = "LOCAL_STORAGE_QUOTA";
        storageError.bytes = textBytes(fallback);
        throw storageError;
      }
    }
    return { compact, bytes: textBytes(serialized), reduced: false };
  }

  window.BreakfastAccountingStorage = { hydrateTransactions, buildLocalSummaries, compactState, persist };
})();
