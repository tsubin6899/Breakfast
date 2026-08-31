(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const money = value => new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0).replace("NT$", "NT$ ");
  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  let shareToken = "";

  function render(statement, expiresAt, response) {
    $("#employee-name").textContent = statement.employeeName || "員工";
    $("#month-label").textContent = statement.monthLabel || statement.month || "";
    $("#expires-label").textContent = `連結有效至 ${new Date(expiresAt).toLocaleString("zh-TW")}`;
    const payroll = statement.payroll || {};
    const leave = statement.leave || {};
    $("#summary-cards").innerHTML = `
      <article><span>一般薪資</span><strong>${money(payroll.regularPay)}</strong></article>
      <article><span>加班與特殊加給</span><strong>${money(Number(payroll.overtimePay || 0) + Number(payroll.specialPay || 0))}</strong></article>
      <article><span>獎金／加給</span><strong>${money(payroll.earnings)}</strong></article>
      <article><span>年假試算餘額</span><strong>${Number(leave.annualRemaining || 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 })} 天</strong></article>
      <article class="total"><span>本月實領</span><strong>${money(payroll.total)}</strong></article>
    `;
    $("#attendance-body").innerHTML = (statement.attendance || []).map(day => `
      <tr>
        <td><strong>${escapeHtml(day.date?.slice(5) || "")}</strong><small>${escapeHtml(day.weekday || "")}・${escapeHtml(day.dayType || "")}</small></td>
        <td>${day.segments?.length ? day.segments.map(segment => `<span>${escapeHtml(segment.start || "??:??")}－${escapeHtml(segment.end || "??:??")}</span>`).join("") : "—"}</td>
        <td>${Number(day.minutes) || "—"}</td>
        <td>${escapeHtml(day.leave || day.status || "—")}</td>
      </tr>
    `).join("");
    $("#pay-lines").innerHTML = (payroll.detailLines || []).map(line => `
      <div><span>${escapeHtml(line.label)}</span><strong>${money(line.amount)}</strong></div>
    `).join("") + `
      <div class="deduction"><span>扣款合計</span><strong>−${money(payroll.deductions)}</strong></div>
      <div class="grand-total"><span>本月實領薪資</span><strong>${money(payroll.total)}</strong></div>
    `;
    if (response) {
      $("#response-result").textContent = response.status === "confirmed"
        ? `已於 ${new Date(response.submittedAt).toLocaleString("zh-TW")} 確認資料正確。`
        : `已送出問題：${response.message}`;
    }
  }

  async function submit(status) {
    const message = $("#employee-message").value.trim();
    if (status === "question" && !message) {
      $("#response-result").textContent = "請先填寫需要確認的問題。";
      return;
    }
    const buttons = [$("#confirm-statement"), $("#question-statement")];
    buttons.forEach(button => { button.disabled = true; });
    try {
      const response = await fetch(`/api/employee-share?token=${encodeURIComponent(shareToken)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, message })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "無法送出核對結果。");
      $("#response-result").textContent = status === "confirmed"
        ? "已完成確認，謝謝。"
        : "問題已送出，請等待店內管理者回覆。";
    } catch (error) {
      $("#response-result").textContent = error instanceof Error ? error.message : "無法送出核對結果。";
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  async function init() {
    shareToken = new URLSearchParams(location.search).get("token") || "";
    try {
      const response = await fetch(`/api/employee-share?token=${encodeURIComponent(shareToken)}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "無法讀取員工明細。");
      render(result.statement, result.expiresAt, result.response);
      $("#portal-loading").hidden = true;
      $("#portal-content").hidden = false;
    } catch (error) {
      $("#portal-loading").hidden = true;
      $("#portal-error").hidden = false;
      $("#portal-error").textContent = error instanceof Error ? error.message : "無法讀取員工明細。";
    }
    $("#confirm-statement").addEventListener("click", () => submit("confirmed"));
    $("#question-statement").addEventListener("click", () => submit("question"));
  }

  document.addEventListener("DOMContentLoaded", init);
})();
