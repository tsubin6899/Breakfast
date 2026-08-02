(() => {
  "use strict";

  const REQUIRED_COLUMNS = ["訂單日期", "訂單編號", "foodpanda 應付(應收)金額"];
  const decoder = new TextDecoder("utf-8");

  function normalizeHeader(value) {
    return String(value || "").replace(/^\ufeff/, "").trim();
  }

  function parseAmount(value) {
    const normalized = String(value ?? "").replaceAll(",", "").trim();
    if (!normalized) return null;
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : null;
  }

  function parseDate(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    }
    const match = String(value || "").trim().match(/^(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})$/);
    if (!match) return "";
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(Number(match[1]), month - 1, day));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return "";
    return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function decodeXml(value) {
    return String(value || "")
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&apos;", "'")
      .replaceAll("&amp;", "&");
  }

  function attributes(text) {
    const result = {};
    for (const match of String(text || "").matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = decodeXml(match[2]);
    return result;
  }

  function columnIndex(reference) {
    const letters = String(reference || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    let result = 0;
    for (const letter of letters) result = result * 26 + letter.charCodeAt(0) - 64;
    return result - 1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") throw new Error("XLSX_DECOMPRESSION_UNAVAILABLE");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    const minimum = Math.max(0, bytes.byteLength - 65557);
    for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
    }
    if (end < 0) throw new Error("XLSX_ZIP_INVALID");
    const entries = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const files = new Map();
    for (let index = 0; index < entries; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX_ZIP_INVALID");
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const fileNameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength)).replaceAll("\\", "/");
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("XLSX_ZIP_INVALID");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      if (method === 0) files.set(name, compressed);
      else if (method === 8) files.set(name, await inflateRaw(compressed));
      else throw new Error("XLSX_COMPRESSION_UNSUPPORTED");
      offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return files;
  }

  function xmlText(files, name, optional = false) {
    const bytes = files.get(name);
    if (!bytes && optional) return "";
    if (!bytes) throw new Error(`XLSX_PART_MISSING:${name}`);
    return decoder.decode(bytes);
  }

  function parseSharedStrings(xml) {
    return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)].map(match =>
      [...match[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map(item => decodeXml(item[1])).join("")
    );
  }

  function parseWorksheet(xml, sharedStrings) {
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/gi)) {
      const row = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi)) {
        const meta = attributes(cellMatch[1]);
        const body = cellMatch[2] || "";
        const index = columnIndex(meta.r);
        const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1] ?? "";
        let value;
        if (meta.t === "s") value = sharedStrings[Number(raw)] ?? "";
        else if (meta.t === "inlineStr") value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map(item => decodeXml(item[1])).join("");
        else if (meta.t === "str" || meta.t === "e") value = decodeXml(raw);
        else if (meta.t === "b") value = raw === "1";
        else value = raw === "" ? "" : Number.isFinite(Number(raw)) ? Number(raw) : decodeXml(raw);
        row[index] = value;
      }
      rows.push(row);
    }
    return rows;
  }

  async function readWorkbook(bytes) {
    const files = await unzip(new Uint8Array(bytes));
    const workbookXml = xmlText(files, "xl/workbook.xml");
    const relationXml = xmlText(files, "xl/_rels/workbook.xml.rels");
    const sharedStrings = parseSharedStrings(xmlText(files, "xl/sharedStrings.xml", true));
    const relations = new Map([...relationXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/gi)].map(match => {
      const meta = attributes(match[1]);
      return [meta.Id, meta.Target];
    }));
    const sheets = [];
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/gi)) {
      const meta = attributes(match[1]);
      const target = relations.get(meta["r:id"]);
      if (!target) continue;
      const normalizedTarget = target.replace(/^\//, "").replace(/^xl\//, "");
      const partName = `xl/${normalizedTarget}`.replace(/\/\.\//g, "/");
      sheets.push({ name: meta.name, rows: parseWorksheet(xmlText(files, partName), sharedStrings) });
    }
    return sheets;
  }

  function canonical(value) {
    return String(value || "").toLowerCase().replace(/[\s_\-]/g, "");
  }

  function isFoodpandaIncome(row) {
    return row?.type === "income" && /foodpanda|熊貓/.test(canonical(`${row.category || ""}${row.counterparty || ""}`));
  }

  function simpleHash(bytes) {
    let hash = 2166136261;
    for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  async function fileFingerprint(bytes) {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    }
    return simpleHash(new Uint8Array(bytes));
  }

  function sum(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
  }

  async function analyzeFile({ file, transactions = [], importBatches = [] }) {
    if (!file || !/\.xlsx$/i.test(file.name || "")) throw new Error("INVALID_EXTENSION");
    const bytes = await file.arrayBuffer();
    const [fingerprint, sheets] = await Promise.all([fileFingerprint(bytes), readWorkbook(bytes)]);
    let orderSheet = null;
    for (const sheet of sheets) {
      const headerRowIndex = sheet.rows.findIndex(row => {
        const names = new Set(row.map(normalizeHeader));
        return REQUIRED_COLUMNS.every(name => names.has(name));
      });
      if (headerRowIndex >= 0) { orderSheet = { ...sheet, headerRowIndex }; break; }
    }
    if (!orderSheet) throw new Error("HEADER_MISSING");

    const headers = orderSheet.rows[orderSheet.headerRowIndex].map(normalizeHeader);
    const columns = new Map(headers.map((name, index) => [name, index]));
    const valueAt = (row, name) => columns.has(name) ? row[columns.get(name)] : "";
    const details = [];
    const invalidRows = [];
    const orderIds = new Map();
    for (let index = orderSheet.headerRowIndex + 1; index < orderSheet.rows.length; index += 1) {
      const row = orderSheet.rows[index];
      if (!row.some(value => String(value ?? "").trim())) continue;
      const date = parseDate(valueAt(row, "訂單日期"));
      const amount = parseAmount(valueAt(row, "foodpanda 應付(應收)金額"));
      if (!date || amount === null) {
        invalidRows.push({ sourceRow: index + 1, date: valueAt(row, "訂單日期"), amount: valueAt(row, "foodpanda 應付(應收)金額") });
        continue;
      }
      const orderId = String(valueAt(row, "訂單編號") || "").trim();
      if (orderId) orderIds.set(orderId, (orderIds.get(orderId) || 0) + 1);
      details.push({
        sourceRow: index + 1,
        date,
        amount,
        orderId,
        itemAmount: parseAmount(valueAt(row, "商品金額")) || 0,
        commission: parseAmount(valueAt(row, "綜合佣金總額")) || 0,
        merchantCollected: parseAmount(valueAt(row, "商家已收金額")) || 0,
        delivery: String(valueAt(row, "配送方式") || "").trim()
      });
    }
    if (!details.length) throw new Error("NO_VALID_ROWS");

    const daily = new Map();
    for (const detail of details) {
      if (!daily.has(detail.date)) daily.set(detail.date, { date: detail.date, detailRows: 0, amount: 0, itemAmount: 0, commission: 0, merchantCollected: 0 });
      const day = daily.get(detail.date);
      day.detailRows += 1;
      day.amount += detail.amount;
      day.itemAmount += detail.itemAmount;
      day.commission += detail.commission;
      day.merchantCollected += detail.merchantCollected;
    }

    const adjustments = [];
    for (const sheet of sheets) {
      const headerRowIndex = sheet.rows.findIndex(row => {
        const names = new Set(row.map(normalizeHeader));
        return names.has("項目") && names.has("詳細資訊") && names.has("金額");
      });
      if (headerRowIndex < 0) continue;
      const adjustmentHeaders = sheet.rows[headerRowIndex].map(normalizeHeader);
      const adjustmentColumns = new Map(adjustmentHeaders.map((name, index) => [name, index]));
      for (const row of sheet.rows.slice(headerRowIndex + 1)) {
        if (!row.some(value => String(value ?? "").trim())) continue;
        const amount = parseAmount(row[adjustmentColumns.get("金額")]);
        if (amount === null) continue;
        adjustments.push({
          item: String(row[adjustmentColumns.get("項目")] || "").trim(),
          detail: String(row[adjustmentColumns.get("詳細資訊")] || "").trim(),
          amount,
          currency: adjustmentColumns.has("幣別") ? String(row[adjustmentColumns.get("幣別")] || "").trim() : ""
        });
      }
    }

    const fileStub = fingerprint.slice(0, 12);
    const auditRows = [];
    const importedTransactions = [];
    const replacedTransactionIds = [];
    for (const day of [...daily.values()].sort((a, b) => a.date.localeCompare(b.date))) {
      const existing = transactions.filter(row => row.date === day.date && isFoodpandaIncome(row));
      const existingAmount = existing.reduce((total, row) => total + Number(row.amount || 0), 0);
      const status = !existing.length ? "new" : Math.abs(existingAmount - day.amount) < .01 ? "matched" : "replace";
      const reason = status === "new"
        ? "系統尚無 foodpanda 收入"
        : status === "matched"
          ? `系統 foodpanda 收入同為 ${day.amount.toLocaleString("zh-TW")} 元`
          : `系統為 ${existingAmount.toLocaleString("zh-TW")} 元，將依對帳單改為 ${day.amount.toLocaleString("zh-TW")} 元`;
      auditRows.push({ ...day, status, existingAmount, existingRows: existing.length, reason });
      if (status === "matched") continue;
      if (status === "replace") replacedTransactionIds.push(...existing.map(row => row.id));
      importedTransactions.push({
        id: `foodpanda-statement-${fileStub}-${day.date}`,
        date: day.date,
        type: "income",
        group: "平台收入",
        category: "foodpanda外送",
        amount: day.amount,
        paymentMethod: "平台匯款",
        counterparty: "foodpanda",
        note: `foodpanda 對帳單按訂單日期彙總・${day.detailRows} 筆`,
        source: "foodpanda-statement",
        sourceRef: `${file.name}・訂單日期・${day.date}・應付應收金額`,
        locked: true
      });
    }

    const dailyRows = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
    const periodFees = adjustments.reduce((total, row) => total + Number(row.amount || 0), 0);
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
      itemAmount: sum(details, "itemAmount"),
      commission: sum(details, "commission"),
      merchantCollected: sum(details, "merchantCollected"),
      periodFees,
      estimatedPayout: sum(details, "amount") - periodFees,
      duplicateOrderRows: [...orderIds.values()].reduce((total, count) => total + Math.max(0, count - 1), 0)
    };
    const previousBatch = importBatches.find(batch => batch.kind === "foodpanda-statement" && batch.fingerprint === fingerprint) || null;
    const report = {
      file: { name: file.name, fingerprint, size: file.size, lastModified: file.lastModified },
      period: { from, through },
      policy: {
        dateBasis: "訂單日期",
        amountBasis: "foodpanda 應付(應收)金額",
        adjustmentPolicy: "附件2的整期費用獨立揭露，不任意分攤至每日收入",
        overlapPolicy: "同日同額略過；同日異額先移除舊 foodpanda 收入，再依對帳單寫入"
      },
      summary,
      adjustments,
      invalidRows,
      dailyTotals: auditRows.map(row => ({ date: row.date, detailRows: row.detailRows, amount: row.amount, existingAmount: row.existingAmount, difference: row.amount - row.existingAmount, status: row.status })),
      replacementIds: replacedTransactionIds
    };
    return {
      file: report.file,
      period: report.period,
      summary,
      adjustments,
      auditRows,
      invalidRows,
      transactions: importedTransactions,
      replacedTransactionIds,
      previousBatch,
      report
    };
  }

  window.BreakfastFoodpandaStatementImporter = { analyzeFile };
})();
