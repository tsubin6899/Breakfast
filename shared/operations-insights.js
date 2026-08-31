(() => {
  "use strict";

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeBudget(value, groups = []) {
    const input = value && typeof value === "object" ? value : {};
    return {
      targetIncome: Math.max(0, number(input.targetIncome)),
      targetExpense: Math.max(0, number(input.targetExpense)),
      targetNet: Math.max(0, number(input.targetNet)),
      groups: Object.fromEntries(groups.map(group => [group, Math.max(0, number(input.groups?.[group]))])),
      updatedAt: typeof input.updatedAt === "string" ? input.updatedAt : ""
    };
  }

  function aggregate(rows, keySelector) {
    const values = new Map();
    (Array.isArray(rows) ? rows : []).forEach(item => {
      const key = String(keySelector(item) || "").trim();
      if (!key) return;
      values.set(key, (values.get(key) || 0) + number(item.amount));
    });
    return values;
  }

  function detectMonthAnomalies(currentRows, previousRows, options = {}) {
    const minimumAmount = number(options.minimumAmount || 3000);
    const threshold = number(options.threshold || 0.25);
    const current = aggregate(currentRows, item => item.counterparty || item.category || item.group);
    const previous = aggregate(previousRows, item => item.counterparty || item.category || item.group);
    return [...current.entries()].map(([name, amount]) => {
      const previousAmount = previous.get(name) || 0;
      const change = previousAmount > 0 ? (amount - previousAmount) / previousAmount : amount >= minimumAmount ? 1 : 0;
      return { name, amount, previousAmount, change };
    }).filter(item => item.amount >= minimumAmount && item.change >= threshold)
      .sort((a, b) => (b.amount - b.previousAmount) - (a.amount - a.previousAmount));
  }

  function buildBudgetRows(budget, totals, groupTotals = {}) {
    const rows = [];
    if (number(budget.targetIncome) > 0) rows.push({ key: "income", label: "收入目標", actual: number(totals.income), limit: number(budget.targetIncome), inverse: false });
    if (number(budget.targetExpense) > 0) rows.push({ key: "expense", label: "支出上限", actual: number(totals.expense), limit: number(budget.targetExpense), inverse: true });
    if (number(budget.targetNet) > 0) rows.push({ key: "net", label: "淨額目標", actual: number(totals.net), limit: number(budget.targetNet), inverse: false });
    Object.entries(budget.groups || {}).forEach(([group, limit]) => {
      if (number(limit) > 0) rows.push({ key: `group:${group}`, label: group, actual: number(groupTotals[group]), limit: number(limit), inverse: true });
    });
    return rows.map(row => ({ ...row, ratio: row.limit > 0 ? row.actual / row.limit : 0 }));
  }

  window.BreakfastOperationsInsights = { normalizeBudget, detectMonthAnomalies, buildBudgetRows };
})();
