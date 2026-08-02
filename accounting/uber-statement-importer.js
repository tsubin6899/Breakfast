(() => {
  "use strict";

  const REQUIRED_COLUMNS = ["訂單日期", "總金額"];

  function normalizeHeader(value) {
    return String(value || "").replace(/^\ufeff/, "").trim();
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (char === '"' && text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (field || row.length) {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
    }
    return rows;
  }

  function parseAmount(value) {
    const normalized = String(value ?? "").replaceAll(",", "").trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  function parseDate(value) {
    const match = String(value || "").trim().match(/^(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) return "";
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(Number(match[1]), month - 1, day));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
    return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function canonical(value) {
    return String(value || "").toLowerCase().replace(/[\s_\-]/g, "");
  }

  function isUberIncome(row) {
    return row?.type === "income" && canonical(row.category).includes("uber");
  }

  function simpleHash(bytes) {
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  async function fileFingerprint(file, bytes) {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
    return simpleHash(new Uint8Array(bytes));
  }

  function valueAt(row, columns, name) {
    const index = columns.get(name);
    return index === undefined ? "" : row[index];
  }

  function sum(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  }

  async function analyzeFile({ file, transactions = [], importBatches = [] }) {
    if (!file || !/\.csv$/i.test(file.name || "")) throw new Error("INVALID_EXTENSION");
    const bytes = await file.arrayBuffer();
    const fingerprint = await fileFingerprint(file, bytes);
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\ufeff/, "");
    const rows = parseCsv(text);
    const headerRowIndex = rows.findIndex(row => {
      const names = new Set(row.map(normalizeHeader));
      return REQUIRED_COLUMNS.every(name => names.has(name));
    });
    if (headerRowIndex < 0) throw new Error("HEADER_MISSING");

    const headers = rows[headerRowIndex].map(normalizeHeader);
    const columns = new Map(headers.map((name, index) => [name, index]));
    const requiredMissing = REQUIRED_COLUMNS.filter(name => !columns.has(name));
    if (requiredMissing.length) throw new Error("HEADER_MISSING");

    const details = [];
    const invalidRows = [];
    const orderIds = new Map();
    const uuids = new Map();
    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row.some(value => String(value || "").trim())) continue;
      const date = parseDate(valueAt(row, columns, "訂單日期"));
      const amount = parseAmount(valueAt(row, columns, "總金額"));
      if (!date || amount === null) {
        invalidRows.push({ sourceRow: index + 1, date: valueAt(row, columns, "訂單日期"), amount: valueAt(row, columns, "總金額") });
        continue;
      }
      const orderId = valueAt(row, columns, "訂單 ID").trim();
      const uuid = valueAt(row, columns, "訂單 UUID").trim();
      if (orderId) orderIds.set(orderId, (orderIds.get(orderId) || 0) + 1);
      if (uuid) uuids.set(uuid, (uuids.get(uuid) || 0) + 1);
      details.push({
        sourceRow: index + 1,
        date,
        amount,
        orderId,
        uuid,
        store: valueAt(row, columns, "商店名稱").trim(),
        status: valueAt(row, columns, "訂單狀態").trim(),
        sales: parseAmount(valueAt(row, columns, "銷售額（含加值型營業稅）")) || 0,
        adjustment: parseAmount(valueAt(row, columns, "訂單錯誤調整（含加值型營業稅）")) || 0,
        serviceFee: parseAmount(valueAt(row, columns, "折扣後的平台服務費（含加值型營業稅）")) || 0
      });
    }
    if (!details.length) throw new Error("NO_VALID_ROWS");

    const daily = new Map();
    for (const detail of details) {
      if (!daily.has(detail.date)) daily.set(detail.date, { date: detail.date, detailRows: 0, amount: 0, sales: 0, adjustment: 0, serviceFee: 0, statuses: {} });
      const day = daily.get(detail.date);
      day.detailRows += 1;
      day.amount += detail.amount;
      day.sales += detail.sales;
      day.adjustment += detail.adjustment;
      day.serviceFee += detail.serviceFee;
      day.statuses[detail.status || "未標示"] = (day.statuses[detail.status || "未標示"] || 0) + 1;
    }

    const fileStub = fingerprint.slice(0, 12);
    const auditRows = [];
    const importedTransactions = [];
    const replacedTransactionIds = [];
    for (const day of [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))) {
      const existing = transactions.filter(row => row.date === day.date && isUberIncome(row));
      const existingAmount = existing.reduce((total, row) => total + Number(row.amount || 0), 0);
      const status = !existing.length ? "new" : Math.abs(existingAmount - day.amount) < .01 ? "matched" : "replace";
      const reason = status === "new"
        ? "該日尚無 Uber 收入"
        : status === "matched"
          ? `既有 Uber 收入已是 ${day.amount.toLocaleString("zh-TW")} 元`
          : `既有 ${existingAmount.toLocaleString("zh-TW")} 元將由對帳單 ${day.amount.toLocaleString("zh-TW")} 元取代`;
      auditRows.push({ ...day, status, existingAmount, existingRows: existing.length, reason });
      if (status === "matched") continue;
      if (status === "replace") replacedTransactionIds.push(...existing.map(row => row.id));
      importedTransactions.push({
        id: `uber-statement-${fileStub}-${day.date}`,
        date: day.date,
        type: "income",
        group: "平台收入",
        category: "Uber eat外送",
        amount: day.amount,
        paymentMethod: "平台入帳",
        counterparty: "Uber Eats",
        note: `Uber 對帳單按訂單日期彙總・${day.detailRows} 筆${Object.keys(day.statuses).some(value => /退款|爭議/.test(value)) ? "（含退款調整）" : ""}`,
        source: "uber-statement",
        sourceRef: `${file.name}・訂單日期 ${day.date}・總金額`,
        locked: true
      });
    }

    const dailyRows = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
    const statuses = details.reduce((result, row) => {
      result[row.status || "未標示"] = (result[row.status || "未標示"] || 0) + 1;
      return result;
    }, {});
    const duplicateOrderRows = [...orderIds.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
    const duplicateUuidRows = [...uuids.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
    const from = dailyRows[0].date;
    const through = dailyRows.at(-1).date;
    const summary = {
      sourceRows: details.length,
      invalidRows: invalidRows.length,
      dailyRows: dailyRows.length,
      newDays: auditRows.filter(row => row.status === "new").length,
      matchedDays: auditRows.filter(row => row.status === "matched").length,
      replacedDays: auditRows.filter(row => row.status === "replace").length,
      importedRows: importedTransactions.length,
      importedNet: sum(importedTransactions, "amount"),
      statementNet: sum(details, "amount"),
      sales: sum(details, "sales"),
      adjustments: sum(details, "adjustment"),
      serviceFees: sum(details, "serviceFee"),
      refundRows: details.filter(row => row.status.includes("退款") && !row.status.includes("爭議")).length,
      refundDisputeRows: details.filter(row => row.status.includes("爭議")).length,
      negativeRows: details.filter(row => row.amount < 0).length,
      duplicateOrderRows,
      duplicateUuidRows
    };
    const previousBatch = importBatches.find(batch => batch.kind === "uber-statement" && batch.fingerprint === fingerprint) || null;
    const report = {
      file: { name: file.name, fingerprint, size: file.size, lastModified: file.lastModified },
      period: { from, through },
      policy: {
        dateBasis: "訂單日期",
        amountBasis: "總金額",
        duplicatePolicy: "退款／退款爭議可能沿用訂單 ID，因此保留每一列並依總金額正負數加總",
        overlapPolicy: "同日同額略過；同日不同額由新對帳單取代既有 Uber 收入"
      },
      summary,
      statuses,
      stores: [...new Set(details.map(row => row.store).filter(Boolean))],
      invalidRows,
      dailyTotals: auditRows.map(row => ({ date: row.date, detailRows: row.detailRows, amount: row.amount, existingAmount: row.existingAmount, status: row.status, statuses: row.statuses })),
      replacementIds: replacedTransactionIds
    };

    return {
      file: report.file,
      period: report.period,
      summary,
      statuses,
      auditRows,
      invalidRows,
      transactions: importedTransactions,
      replacedTransactionIds,
      previousBatch,
      report
    };
  }

  window.BreakfastUberStatementImporter = { analyzeFile, parseCsv };
})();
