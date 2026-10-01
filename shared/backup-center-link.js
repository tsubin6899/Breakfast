(() => {
  "use strict";
  document.addEventListener("DOMContentLoaded", () => {
    const destination = "/dashboard_cost/#analysis-safety";
    const link = () => {
      const element = document.createElement("a");
      element.href = destination;
      element.className = "secondary-btn";
      element.textContent = "前往資料安全中心（整合備份與同步）";
      return element;
    };
    const backupPanel = document.getElementById("download-backup")?.closest(".backup-panel");
    if (backupPanel) {
      const note = document.createElement("article");
      note.className = "panel";
      const title = document.createElement("h3");
      title.textContent = "整合營運備份";
      const description = document.createElement("p");
      description.textContent = "記帳、員工、打卡與薪資統一在經營報表的資料安全中心管理。";
      note.append(title, description, link());
      backupPanel.before(note);
      backupPanel.hidden = true;
      backupPanel.style.display = "none";
    }
    const accountingCloud = document.getElementById("accounting-cloud-sync")?.closest(".accounting-cloud-actions");
    if (accountingCloud) {
      accountingCloud.before(link());
      for (const id of ["accounting-cloud-sync", "accounting-cloud-use-remote", "accounting-cloud-use-local"]) {
        const button = document.getElementById(id);
        if (button) button.style.display = "none";
      }
    }
    const safetyButton = document.getElementById("safety-download-backup");
    if (safetyButton) { safetyButton.before(link()); safetyButton.style.display = "none"; }
    const payrollActions = document.getElementById("cloud-account-actions");
    if (payrollActions) {
      payrollActions.before(link());
      for (const id of ["cloud-download-latest", "cloud-upload-current", "cloud-download-local-backup"]) {
        const button = document.getElementById(id);
        if (button) button.style.display = "none";
      }
    }
    const ownKey = location.pathname.includes("/salary_app") ? "breakfast-payroll-v1" : "breakfast-accounting-v1";
    window.addEventListener("storage", event => {
      if (event.key === ownKey && event.oldValue !== event.newValue) location.reload();
    });
  });
})();
