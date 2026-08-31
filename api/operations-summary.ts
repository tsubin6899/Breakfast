import { getSession } from "./_lib/auth.js";
import { readJson } from "./_lib/blob-store.js";
import { json } from "./_lib/http.js";

type GenericState = Record<string, unknown>;
type CloudDocument = { revision?: string; updatedAt?: string; updatedBy?: string; state?: GenericState };

const ACCOUNTING_PATH = "breakfast/state/accounting-current.json";
const PAYROLL_PATH = "breakfast/state/payroll-current.json";
const REQUIRED_INCOME = ["快一點line pay收入", "現金營業收入", "line Pay經營收入", "Uber eat外送", "Foodpanda外送"];

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalIncome(value: unknown) {
  const text = String(value || "").trim();
  const key = text.toLowerCase().replace(/[\s_\-]/g, "");
  if (/uber/.test(key)) return "Uber eat外送";
  if (/foodpanda|熊貓/.test(key)) return "Foodpanda外送";
  if (/快一點/.test(key)) return "快一點line pay收入";
  if (/linepay|line收入/.test(key)) return "line Pay經營收入";
  if (/現金/.test(key)) return "現金營業收入";
  return text;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function previousMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(year, value - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function summarizeAccounting(state: GenericState, month: string) {
  const transactions = records(state.transactions);
  const monthRows = transactions.filter(item => String(item.date || "").startsWith(month));
  const previousRows = transactions.filter(item => String(item.date || "").startsWith(previousMonth(month)));
  const income = monthRows.filter(item => item.type === "income").reduce((sum, item) => sum + number(item.amount), 0);
  const expense = monthRows.filter(item => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0);
  const dayLabor = records(state.dayLabor).filter(item => String(item.date || "").startsWith(month)).reduce((sum, item) => sum + number(item.amount || item.dailyWage), 0);
  const expenseGroups = new Map<string, number>();
  const vendors = new Map<string, number>();
  monthRows.filter(item => item.type === "expense").forEach(item => {
    const group = String(item.group || "其他支出");
    const vendor = String(item.counterparty || item.category || "未填廠商");
    expenseGroups.set(group, (expenseGroups.get(group) || 0) + number(item.amount));
    vendors.set(vendor, (vendors.get(vendor) || 0) + number(item.amount));
  });

  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const shopClosed = Boolean((state.shopClosures as Record<string, unknown> | undefined)?.[todayDate]);
  const recorded = new Set(monthRows.filter(item => item.type === "income" && item.date === todayDate && number(item.amount) > 0).map(item => canonicalIncome(item.category || item.counterparty || item.group)));
  const missingToday = month === todayDate.slice(0, 7) && !shopClosed ? REQUIRED_INCOME.filter(item => !recorded.has(item)) : [];
  const reconciliations = Object.values((state.reconciliations as Record<string, unknown> | undefined) || {}).filter(item => item && typeof item === "object") as Record<string, unknown>[];
  const unresolved = reconciliations.filter(item => String(item.date || "").startsWith(month) && Math.abs(number(item.difference)) > 1).length;
  const unclassified = monthRows.filter(item => !item.group || !item.category || /未分類/.test(`${item.group || ""}${item.category || ""}`)).length;
  const budgets = ((state.budgets as Record<string, unknown> | undefined)?.[month] || {}) as Record<string, unknown>;
  const previousExpense = previousRows.filter(item => item.type === "expense").reduce((sum, item) => sum + number(item.amount), 0);

  return {
    income,
    expense: expense + dayLabor,
    net: income - expense - dayLabor,
    transactionCount: monthRows.length,
    missingToday,
    shopClosed,
    unresolvedReconciliations: unresolved,
    unclassified,
    budgets,
    previousExpense,
    expenseGroups: [...expenseGroups.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount })),
    vendors: [...vendors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, amount]) => ({ name, amount }))
  };
}

function summarizePayroll(state: GenericState, month: string) {
  const attendance = Object.values((state.attendance as Record<string, unknown> | undefined) || {}).filter(item => item && typeof item === "object") as Record<string, unknown>[];
  const pending = attendance.filter(item => String(item.date || "").startsWith(month) && item.status !== "confirmed").length;
  const employees = records(state.employees).filter(item => item.active !== false);
  const closure = ((state.closedMonths as Record<string, unknown> | undefined)?.[month] || {}) as Record<string, unknown>;
  const snapshot = (closure.snapshot || {}) as Record<string, unknown>;
  const rows = records(snapshot.rows);
  const total = rows.reduce((sum, item) => sum + number(item.total), 0);
  return { employeeCount: employees.length, pendingAttendance: pending, locked: closure.locked === true, total };
}

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED", message: "只接受 GET 請求。" }, 405);
    const user = await getSession(request);
    if (!user) return json({ error: "UNAUTHORIZED", message: "請先登入管理者帳號。" }, 401);
    const requestedMonth = new URL(request.url).searchParams.get("month") || "";
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : currentMonth();
    const [accounting, payroll] = await Promise.all([readJson<CloudDocument>(ACCOUNTING_PATH), readJson<CloudDocument>(PAYROLL_PATH)]);
    const accountingState = accounting?.value.state || {};
    const payrollState = payroll?.value.state || {};
    const audit = [...records(accountingState.auditLog), ...records(payrollState.auditLog)]
      .sort((a, b) => String(b.timestamp || b.createdAt || "").localeCompare(String(a.timestamp || a.createdAt || "")))
      .slice(0, 8)
      .map(item => ({ action: String(item.action || "更新資料").slice(0, 80), detail: String(item.detail || "").slice(0, 180), timestamp: String(item.timestamp || item.createdAt || "") }));
    return json({
      month,
      user,
      accounting: summarizeAccounting(accountingState, month),
      payroll: summarizePayroll(payrollState, month),
      sync: {
        accounting: { updatedAt: accounting?.value.updatedAt || "", updatedBy: accounting?.value.updatedBy || "", revision: accounting?.value.revision || "" },
        payroll: { updatedAt: payroll?.value.updatedAt || "", updatedBy: payroll?.value.updatedBy || "", revision: payroll?.value.revision || "" }
      },
      services: {
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
        openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
        cloudStorageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN)
      },
      audit
    });
  }
};
