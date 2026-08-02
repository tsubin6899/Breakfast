(function (root, factory) {
  root.BREAKFAST_SPECIAL_OVERTIME = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const HE_DEFAULT_RULE = {
    id: "he-monthly-after-12-mwf-1130",
    name: "每月 12 日起・週一三五 11:30",
    effectiveFrom: "2026-07-01",
    effectiveTo: "",
    monthDayStart: 12,
    monthDayEnd: 31,
    weekdays: [1, 3, 5],
    scheduleStart: "11:30",
    scheduleEnd: "",
    enabled: true
  };

  function clampDay(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(31, Math.round(number))) : fallback;
  }

  function normalizeRule(rule, index = 0, employeeId = "employee") {
    return {
      id: rule?.id || `special-overtime-${employeeId}-${index}`,
      name: String(rule?.name || `特殊規則 ${index + 1}`).trim(),
      effectiveFrom: rule?.effectiveFrom || "2000-01-01",
      effectiveTo: rule?.effectiveTo || "",
      monthDayStart: clampDay(rule?.monthDayStart, 1),
      monthDayEnd: clampDay(rule?.monthDayEnd, 31),
      weekdays: Array.isArray(rule?.weekdays)
        ? [...new Set(rule.weekdays.map(Number).filter(day => day >= 0 && day <= 6))]
        : [],
      scheduleStart: rule?.scheduleStart || "",
      scheduleEnd: rule?.scheduleEnd || "",
      enabled: rule?.enabled !== false
    };
  }

  function rulesForEmployee(employee) {
    const source = Array.isArray(employee?.specialOvertimeRules)
      ? employee.specialOvertimeRules
      : employee?.id === "he" ? [HE_DEFAULT_RULE] : [];
    return source.map((rule, index) => normalizeRule(rule, index, employee?.id || "employee"));
  }

  function dayInRange(day, start, end) {
    return start <= end ? day >= start && day <= end : day >= start || day <= end;
  }

  function ruleMatchesDate(rule, date) {
    if (!rule.enabled || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    if (rule.effectiveFrom && date < rule.effectiveFrom) return false;
    if (rule.effectiveTo && date > rule.effectiveTo) return false;
    const dayOfMonth = Number(date.slice(8, 10));
    if (!dayInRange(dayOfMonth, rule.monthDayStart, rule.monthDayEnd)) return false;
    if (!rule.weekdays.length) return true;
    const weekday = new Date(`${date}T12:00:00`).getDay();
    return rule.weekdays.includes(weekday);
  }

  function ruleForDate(rules, date) {
    return (Array.isArray(rules) ? rules : [])
      .map((rule, index) => ({ ...normalizeRule(rule, index), _order: index }))
      .filter(rule => ruleMatchesDate(rule, date))
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a._order - b._order)
      .at(-1) || null;
  }

  function applyRule(baseSchedule, rules, date) {
    const rule = ruleForDate(rules, date);
    if (!rule) return { ...baseSchedule, source: baseSchedule.source || "weekly", rule: null };
    return {
      ...baseSchedule,
      start: rule.scheduleStart || baseSchedule.start || "",
      end: rule.scheduleEnd || baseSchedule.end || "",
      source: "special",
      rule
    };
  }

  return {
    HE_DEFAULT_RULE: { ...HE_DEFAULT_RULE },
    normalizeRule,
    rulesForEmployee,
    ruleMatchesDate,
    ruleForDate,
    applyRule
  };
});
