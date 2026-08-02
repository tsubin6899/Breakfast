(() => {
  "use strict";

  const SQLITE_SIGNATURE = new Uint8Array([83, 81, 76, 105, 116, 101, 32, 102, 111, 114, 109, 97, 116, 32, 51, 0]);
  const REQUIRED_TABLES = ["transactions", "splitTransaction", "category"];
  const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  let sqlEnginePromise;

  function compactName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  function normalizeCategory(value, type) {
    const raw = String(value || "").trim();
    const key = compactName(raw);
    if (type === "income") {
      if (["現金收入", "當日現金營業額", "現金營業額"].includes(key)) return "現金收入";
      if (["快一點line", "快一點linepay", "快一點linepay收入", "快一點linepay支付"].includes(key)) return "快一點line pay收入";
      if (["linepay", "linepay收入", "linepay經營收入"].includes(key)) return "line Pay經營收入";
      if (["uber", "ubereat", "ubereats", "ubereat外送", "uber收入"].includes(key)) return "Uber eat外送";
      if (["熊貓", "foodpanda", "foodpanda外送", "熊貓外送"].includes(key)) return "foodpanda外送";
      if (["廢油", "其他", "其他收入"].includes(key)) return "其他收入";
      if (["街口", "街口支付", "街口經營收入"].includes(key)) return "街口經營收入";
      if (key === "全支付") return "全支付";
      return raw || "其他收入";
    }

    return ({
      "茶葉廠商": "上統茶葉",
      "上統茶葉": "上統茶葉",
      "萬霖雜糧行": "萬霖",
      "萬霖": "萬霖",
      "寶綠免洗餐具": "寶綠餐具",
      "寶綠餐具": "寶綠餐具",
      "瓦斯桶": "瓦斯費",
      "瓦斯費": "瓦斯費",
      "雜項": "其他雜支",
      "其他雜支": "其他雜支"
    })[raw] || raw || "其他雜支";
  }

  function normalizeGroup(parent, category, type) {
    if (type === "income") {
      if (["Uber eat外送", "foodpanda外送"].includes(category)) return "平台收入";
      if (category === "其他收入") return "其他收入";
      return "現金收入";
    }
    const fixedParents = new Set(["公共事業費用", "勞健保險", "手續費類", "繳稅", "房租"]);
    if (parent === "食材類別") return "食材成本";
    if (parent === "飲品類別") return "飲品成本";
    if (parent === "雜貨類別") return "雜貨成本";
    if (fixedParents.has(parent) || ["水費", "電費", "電話費", "瓦斯費", "房租"].includes(category)) return "固定成本";
    return "雜支";
  }

  function matchKey(row) {
    const type = String(row.type || "");
    return [row.date, type, compactName(normalizeCategory(row.category, type)), Math.abs(Number(row.amount || 0)).toFixed(2)].join("|");
  }

  function rowsFromStatement(database, sql, params = []) {
    const statement = database.prepare(sql);
    const rows = [];
    try {
      if (params.length) statement.bind(params);
      while (statement.step()) rows.push(statement.getAsObject());
    } finally {
      statement.free();
    }
    return rows;
  }

  function findSignature(bytes) {
    outer: for (let index = 0; index <= bytes.length - SQLITE_SIGNATURE.length; index += 1) {
      for (let offset = 0; offset < SQLITE_SIGNATURE.length; offset += 1) {
        if (bytes[index + offset] !== SQLITE_SIGNATURE[offset]) continue outer;
      }
      return index;
    }
    return -1;
  }

  function extractSqliteBytes(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const offset = findSignature(bytes);
    if (offset < 0) throw new Error("SQLITE_NOT_FOUND");
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    let pageSize = view.getUint16(16, false);
    if (pageSize === 1) pageSize = 65536;
    const pageCount = view.getUint32(28, false);
    const databaseSize = pageSize * pageCount;
    if (!pageSize || !pageCount || offset + databaseSize > bytes.length) throw new Error("SQLITE_TRUNCATED");
    return bytes.slice(offset, offset + databaseSize);
  }

  async function sqlEngine() {
    if (typeof window.initSqlJs !== "function") throw new Error("SQL_ENGINE_MISSING");
    if (!sqlEnginePromise) {
      sqlEnginePromise = window.initSqlJs({
        locateFile(file) {
          return new URL(`./vendor/${file}`, window.location.href).href;
        }
      });
    }
    return sqlEnginePromise;
  }

  async function sha256(arrayBuffer) {
    const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  }

  function existingSplitIds(transactions) {
    const ids = new Set();
    for (const transaction of transactions || []) {
      if (transaction.sourceSplitId) ids.add(String(transaction.sourceSplitId).toLowerCase());
      const match = String(transaction.id || "").match(UUID_AT_END);
      if (match && transaction.source === "accounting-backup") ids.add(match[1].toLowerCase());
    }
    return ids;
  }

  function existingMatchCounts(transactions) {
    const counts = new Map();
    for (const transaction of transactions || []) {
      const key = matchKey(transaction);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function toTransaction(row, fileName) {
    const type = Number(row.transactionType) === 1 ? "income" : "expense";
    const originalCategory = String(row.sourceCategory || "").trim();
    const category = normalizeCategory(originalCategory, type);
    const group = normalizeGroup(String(row.parentCategory || ""), category, type);
    const amount = Math.abs(Number(row.splitSum || 0));
    const description = String(row.description || "").trim();
    const notes = ["由初一食午記帳備份匯入"];
    if (originalCategory !== category) notes.push(`原分類：${originalCategory}`);
    if (description) notes.push(description);
    return {
      id: `backup-split-${String(row.splitId).toLowerCase()}`,
      date: String(row.entryDate),
      type,
      group,
      category,
      amount,
      paymentMethod: type === "income" ? "營業收入" : "未分類",
      counterparty: category,
      note: notes.join("；"),
      source: "accounting-backup",
      sourceFile: fileName,
      sourceTransactionId: String(row.transactionId),
      sourceSplitId: String(row.splitId),
      sourceSplitIndex: Number(row.splitIndex || 0),
      sourceCategory: originalCategory,
      sourceParentCategory: String(row.parentCategory || ""),
      sourceRef: `${fileName}・${row.transactionId}・split ${row.splitIndex}`,
      needsReview: type === "expense" && group === "雜支" && category !== "其他雜支",
      locked: false
    };
  }

  function summarize(rows, type) {
    return rows.filter(row => row.type === type).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }

  function exclusionReason(transactionType) {
    if (Number(transactionType) === 2) return "帳戶互轉";
    if (Number(transactionType) === 8) return "帳戶餘額調整";
    return `非收支交易（型態 ${transactionType}）`;
  }

  function validateSchema(database) {
    const tables = new Set(rowsFromStatement(database, "SELECT name FROM sqlite_master WHERE type = 'table'").map(row => row.name));
    const missing = REQUIRED_TABLES.filter(table => !tables.has(table));
    if (missing.length) throw new Error(`SCHEMA_MISSING:${missing.join(",")}`);
  }

  async function analyzeFile({ file, startDate, transactions = [], importBatches = [] }) {
    if (!file || !/\.back$/i.test(file.name)) throw new Error("INVALID_EXTENSION");
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(startDate || "")) throw new Error("INVALID_START_DATE");

    const arrayBuffer = await file.arrayBuffer();
    const [SQL, fingerprint] = await Promise.all([sqlEngine(), sha256(arrayBuffer)]);
    const database = new SQL.Database(extractSqliteBytes(arrayBuffer));
    let sourceRows;
    let excludedRows;
    try {
      validateSchema(database);
      sourceRows = rowsFromStatement(database, `
        SELECT date(t.date, 'unixepoch', '+8 hours') AS entryDate,
               t.primaryKey AS transactionId,
               t.transactionType,
               t.description,
               s.primaryKey AS splitId,
               s.sum AS splitSum,
               s.[index] AS splitIndex,
               c.name AS sourceCategory,
               c.flowType,
               p.name AS parentCategory
          FROM transactions t
          JOIN splitTransaction s ON s.transactionsPrimaryKey = t.primaryKey
          JOIN category c ON c.primaryKey = s.categoryPrimaryKey
          LEFT JOIN category p ON p.primaryKey = c.parentPrimaryKey
         WHERE t.isDeleted = 0
           AND date(t.date, 'unixepoch', '+8 hours') >= ?
           AND t.transactionType IN (0, 1)
         ORDER BY t.date, t.primaryKey, s.[index]
      `, [startDate]);
      excludedRows = rowsFromStatement(database, `
        SELECT date(t.date, 'unixepoch', '+8 hours') AS entryDate,
               t.primaryKey AS transactionId,
               t.transactionType,
               t.sum AS amount,
               t.description
          FROM transactions t
         WHERE t.isDeleted = 0
           AND date(t.date, 'unixepoch', '+8 hours') >= ?
           AND t.transactionType NOT IN (0, 1)
         ORDER BY t.date, t.primaryKey
      `, [startDate]).map(row => ({
        date: String(row.entryDate),
        type: "excluded",
        group: "—",
        category: "—",
        amount: Math.abs(Number(row.amount || 0)),
        reason: exclusionReason(row.transactionType),
        sourceTransactionId: String(row.transactionId),
        description: String(row.description || "")
      }));

      const missingSplits = rowsFromStatement(database, `
        SELECT date(t.date, 'unixepoch', '+8 hours') AS entryDate,
               t.primaryKey AS transactionId,
               t.transactionType,
               t.sum AS amount,
               t.description
          FROM transactions t
         WHERE t.isDeleted = 0
           AND date(t.date, 'unixepoch', '+8 hours') >= ?
           AND t.transactionType IN (0, 1)
           AND NOT EXISTS (SELECT 1 FROM splitTransaction s WHERE s.transactionsPrimaryKey = t.primaryKey)
         ORDER BY t.date, t.primaryKey
      `, [startDate]);
      excludedRows.push(...missingSplits.map(row => ({
        date: String(row.entryDate),
        type: "excluded",
        group: "—",
        category: "—",
        amount: Math.abs(Number(row.amount || 0)),
        reason: "缺少分類明細",
        sourceTransactionId: String(row.transactionId),
        description: String(row.description || "")
      })));
    } finally {
      database.close();
    }

    const existingSplits = existingSplitIds(transactions);
    const matchCounts = existingMatchCounts(transactions);
    const importedRows = [];
    const matchedRows = [];
    const auditRows = [];
    const payrollRows = [];
    const invalidRows = [];

    for (const sourceRow of sourceRows) {
      const parent = String(sourceRow.parentCategory || "");
      if (parent === "人事薪資") {
        payrollRows.push({
          date: String(sourceRow.entryDate),
          type: "excluded",
          group: "人事薪資",
          category: String(sourceRow.sourceCategory || ""),
          amount: Math.abs(Number(sourceRow.splitSum || 0)),
          reason: "正式員工薪資由薪資管理串接",
          sourceTransactionId: String(sourceRow.transactionId)
        });
        continue;
      }
      const candidate = toTransaction(sourceRow, file.name);
      if (!candidate.date || !candidate.category || !(candidate.amount > 0)) {
        invalidRows.push({
          date: candidate.date || "—",
          type: "excluded",
          group: candidate.group || "—",
          category: candidate.category || "—",
          amount: candidate.amount || 0,
          reason: "日期、分類或金額無效",
          sourceTransactionId: candidate.sourceTransactionId
        });
        continue;
      }
      const splitId = candidate.sourceSplitId.toLowerCase();
      const key = matchKey(candidate);
      let matchedBy = "";
      if (existingSplits.has(splitId)) matchedBy = "來源明細 ID";
      else if ((matchCounts.get(key) || 0) > 0) matchedBy = "日期＋類型＋分類＋金額";
      if (matchedBy) {
        if ((matchCounts.get(key) || 0) > 0) matchCounts.set(key, matchCounts.get(key) - 1);
        matchedRows.push({ ...candidate, status: "matched", reason: `已存在（${matchedBy}）` });
      } else {
        importedRows.push(candidate);
      }
      auditRows.push({ ...candidate, status: matchedBy ? "matched" : "new", reason: matchedBy ? `已存在（${matchedBy}）` : "預計新增" });
    }

    excludedRows.push(...payrollRows, ...invalidRows);
    const relevantDates = [...sourceRows.map(row => String(row.entryDate)), ...excludedRows.map(row => row.date)].filter(Boolean).sort();
    const reviewCount = importedRows.filter(row => row.needsReview).length;
    const previousBatch = (importBatches || []).find(batch => batch.fingerprint === fingerprint);
    const summary = {
      sourceSplitRows: sourceRows.length,
      eligibleRows: importedRows.length + matchedRows.length,
      matchedRows: matchedRows.length,
      importedRows: importedRows.length,
      excludedRows: excludedRows.length,
      transferRows: excludedRows.filter(row => row.reason === "帳戶互轉").length,
      adjustmentRows: excludedRows.filter(row => row.reason === "帳戶餘額調整").length,
      payrollRows: payrollRows.length,
      invalidRows: invalidRows.length,
      reviewRows: reviewCount,
      importedIncome: summarize(importedRows, "income"),
      importedExpense: summarize(importedRows, "expense")
    };
    const period = {
      from: relevantDates[0] || startDate,
      through: relevantDates.at(-1) || startDate
    };
    const report = {
      generatedAt: new Date().toISOString(),
      source: { fileName: file.name, size: file.size, fingerprint },
      startDate,
      period,
      summary,
      previousImport: previousBatch || null,
      policies: {
        dateTimezone: "以台灣時間（UTC+8）判定日期。",
        excluded: "帳戶互轉、餘額調整、缺少分類的交易及由薪資管理串接的正式員工薪資不匯入。",
        deduplication: "優先比對來源拆分明細 ID；舊資料則以日期、收支類型、正規化分類與金額逐筆比對。",
        processing: "檔案只在瀏覽器內解析，不上傳到 AI 或外部辨識服務。"
      },
      aliases: {
        "快一點line": "快一點line pay收入",
        "line Pay": "line Pay經營收入",
        "廢油": "其他收入",
        "Uber": "Uber eat外送",
        "熊貓": "foodpanda外送"
      },
      newRows: importedRows,
      matchedRows,
      excludedRows
    };

    return {
      file: { name: file.name, size: file.size, fingerprint },
      startDate,
      period,
      summary,
      transactions: importedRows,
      matchedRows,
      excludedRows,
      auditRows,
      previousBatch: previousBatch || null,
      report
    };
  }

  window.BreakfastAccountingBackupImporter = {
    analyzeFile,
    normalizeCategory,
    normalizeGroup,
    matchKey
  };
})();
