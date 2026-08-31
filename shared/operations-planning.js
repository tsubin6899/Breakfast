(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BreakfastOperationsPlanning = api;
})(typeof window !== "undefined" ? window : globalThis, () => {
  "use strict";

  const number = value => Math.max(0, Number(value) || 0);

  function addMonths(month, offset) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(month || ""));
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function buildCashForecast({ historical = [], payables = [], openingCash = 0, months = 3 } = {}) {
    const actual = historical
      .filter(item => /^\d{4}-(0[1-9]|1[0-2])$/.test(item?.month || ""))
      .map(item => ({ month: item.month, income: number(item.income), expenses: number(item.expenses) }))
      .filter(item => item.income > 0 || item.expenses > 0)
      .sort((a, b) => a.month.localeCompare(b.month));
    const basis = actual.slice(-3);
    const divisor = basis.length || 1;
    const averageIncome = basis.reduce((sum, item) => sum + item.income, 0) / divisor;
    const averageExpenses = basis.reduce((sum, item) => sum + item.expenses, 0) / divisor;
    const lastMonth = actual.at(-1)?.month || "";
    let runningCash = Number(openingCash) || 0;
    const rows = Array.from({ length: Math.max(1, Math.min(12, Number(months) || 3)) }, (_, index) => {
      const month = addMonths(lastMonth, index + 1);
      const payableAmount = payables
        .filter(item => item?.status !== "paid" && String(item?.dueDate || "").startsWith(month))
        .reduce((sum, item) => sum + number(item.amount), 0);
      const expenses = averageExpenses + payableAmount;
      const net = averageIncome - expenses;
      runningCash += net;
      return { month, income: averageIncome, baseExpenses: averageExpenses, payableAmount, expenses, net, endingCash: runningCash };
    });
    return { basis, averageIncome, averageExpenses, openingCash: Number(openingCash) || 0, rows };
  }

  function productMetrics(products = []) {
    const rows = products.map((product, index) => {
      const price = number(product?.price);
      const cost = number(product?.cost);
      const units = number(product?.units);
      const unitMargin = price - cost;
      return {
        id: String(product?.id || `product-${index + 1}`),
        name: String(product?.name || "未命名商品"),
        price,
        cost,
        units,
        unitMargin,
        marginRate: price ? unitMargin / price : 0,
        monthlyRevenue: price * units,
        monthlyCost: cost * units,
        monthlyContribution: unitMargin * units
      };
    });
    const totals = rows.reduce((sum, row) => ({
      monthlyRevenue: sum.monthlyRevenue + row.monthlyRevenue,
      monthlyCost: sum.monthlyCost + row.monthlyCost,
      monthlyContribution: sum.monthlyContribution + row.monthlyContribution
    }), { monthlyRevenue: 0, monthlyCost: 0, monthlyContribution: 0 });
    totals.marginRate = totals.monthlyRevenue ? totals.monthlyContribution / totals.monthlyRevenue : 0;
    return { rows, totals };
  }

  return { addMonths, buildCashForecast, productMetrics };
});
