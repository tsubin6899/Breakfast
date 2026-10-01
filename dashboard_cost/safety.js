(() => {
  "use strict";
  const backup = window.BreakfastOperationsBackup;
  const $ = id => document.getElementById(id);
  let busy = false;
  let pending = null;
  const labels = { accounting: "記帳與日薪", payroll: "員工、打卡與薪資" };
  const time = value => value ? new Date(value).toLocaleString("zh-TW") : "尚無更新紀錄";
  function status(message) { $("operations-safety-status").textContent = message; }
  async function requireOwner() {
    if (["localhost", "127.0.0.1"].includes(location.hostname)) return;
    const remote = await window.BreakfastCloudSync.requestJson("/api/operations-workspace?module=payroll", { timeout: 75000 });
    if (remote.user?.role !== "owner") throw new Error("只有店主可以還原整合營運備份。");
  }
  async function renderSnapshots() {
    const rows = await window.BreakfastOperationsStore.listSnapshots("operations");
    $("operations-snapshot-list").replaceChildren(...rows.slice(0, 10).map(row => {
      const line = document.createElement("p");
      line.append(document.createTextNode(time(row.createdAt) + " · " + row.label + " "));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "還原";
      button.dataset.operationsSnapshot = row.id;
      line.append(button);
      return line;
    }));
  }
  function render() {
    const bundle = backup.collect();
    $("operations-backup-counts").textContent = "記帳 " + bundle.modules.accounting.transactions.length.toLocaleString("zh-TW") +
      " 筆 · 員工 " + (bundle.modules.payroll?.employees?.length || 0) + " 人 · 打卡 " +
      Object.keys(bundle.modules.payroll?.attendance || {}).length + " 筆";
    $("operations-backup-versions").replaceChildren(...["accounting", "payroll"].map(name => {
      const line = document.createElement("p");
      const meta = backup.read(backup.metaKey(name)) || {};
      line.textContent = labels[name] + "｜最新變更：" + time(meta.lastLocalChangeAt || meta.lastSuccessAt) +
        "｜" + (meta.dirty ? "等待同步" : meta.revision ? "已同步" : "尚未同步");
      return line;
    }));
    $("operations-last-backup").textContent = "最後下載整合備份：" + time(localStorage.getItem("breakfast-operations-last-backup"));
  }
  async function task(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll("#analysis-safety button").forEach(button => button.disabled = true);
    try { await action(); }
    catch (error) { status(error.message || "操作失敗，請重試。"); }
    finally {
      busy = false;
      document.querySelectorAll("#analysis-safety button").forEach(button => button.disabled = false);
      render();
      await renderSnapshots();
    }
  }
  async function upload(name, remote) {
    const state = backup.read(backup.KEYS[name]);
    if (!state) return;
    const meta = backup.read(backup.metaKey(name)) || {};
    const serialized = JSON.stringify({ module: name, state, baseRevision: remote.revision || "" });
    let body = serialized;
    const headers = { "Content-Type": "application/json" };
    if (typeof CompressionStream !== "undefined") {
      body = await new Response(new Blob([serialized]).stream().pipeThrough(new CompressionStream("gzip"))).blob();
      headers["Content-Type"] = "application/octet-stream";
    }
    const result = await window.BreakfastCloudSync.requestJson("/api/operations-workspace?module=" + name, { method: "PUT", body, headers, timeout: 75000 });
    // Do not clear pending changes made in another tab during the upload.
    const current = backup.read(backup.metaKey(name)) || {};
    localStorage.setItem(backup.metaKey(name), JSON.stringify({ ...current, revision: result.revision,
      lastSuccessAt: result.updatedAt, dirty: current.lastLocalChangeAt !== meta.lastLocalChangeAt }));
  }
  async function synchronize(automatic = false) {
    status("正在核對整合營運雲端資料…");
    const session = await window.BreakfastCloudSync.requestJson("/api/auth/session");
    if (!session.user) { status("請先登入，再同步整合營運資料。"); return; }
    const remotes = {};
    // Check both parts before writing either part.
    for (const name of ["accounting", "payroll"]) remotes[name] = await window.BreakfastCloudSync.requestJson("/api/operations-workspace?module=" + name, { timeout: 75000 });
    const downloads = {};
    const uploads = [];
    const conflicts = [];
    for (const name of ["accounting", "payroll"]) {
      const local = backup.read(backup.KEYS[name]);
      const meta = backup.read(backup.metaKey(name)) || {};
      const remote = remotes[name];
      if (local && meta.dirty && remote.state && meta.revision !== remote.revision) { conflicts.push(name); continue; }
      if (remote.state && (!local || window.BreakfastCloudSync.decideSync(meta, remote) === "download")) downloads[name] = remote.state;
      else if (local && (!remote.state || meta.dirty)) uploads.push(name);
    }
    if (conflicts.length) {
      pending = { remotes, names: conflicts };
      $("operations-conflict").hidden = false;
      $("operations-conflict-detail").textContent = conflicts.map(name => labels[name] + "：本機 " +
        time((backup.read(backup.metaKey(name)) || {}).lastLocalChangeAt) + "／雲端 " + time(remotes[name].updatedAt)).join("；");
      status("有待同步資料與另一個雲端版本，請選擇要保留的資料。");
      return;
    }
    if (Object.keys(downloads).length) await backup.apply(downloads, { remotes, label: "整合雲端同步前快照" });
    if (!automatic) for (const name of uploads) await upload(name, remotes[name]);
    status(automatic && uploads.length ? "本機有較新資料，請按「同步全部營運資料」完成上傳。" : "全部營運資料已核對完成。");
    window.dispatchEvent(new CustomEvent("breakfast-operations-restored"));
  }
  document.addEventListener("DOMContentLoaded", () => {
    $("operations-download").addEventListener("click", () => task(async () => {
      const bundle = backup.collect();
      if (!bundle.modules.payroll) throw new Error("此裝置尚未載入薪資與打卡資料。請先同步全部營運資料，或開啟薪資管理後再下載完整備份。");
      backup.download(bundle);
      localStorage.setItem("breakfast-operations-last-backup", new Date().toISOString());
      status("整合備份已下載：包含記帳、員工、打卡、薪資、歷史薪資與報表設定。");
    }));
    $("operations-sync").addEventListener("click", () => task(() => synchronize()));
    $("operations-restore-file").addEventListener("change", event => task(async () => {
      const file = event.target.files[0];
      if (!file) return;
      try {
        await requireOwner();
        const value = backup.validate(JSON.parse(await file.text()));
        if (!window.confirm("還原整合備份「" + file.name + "」？\n備份時間：" + time(value.exportedAt) +
          "\n記帳：" + value.modules.accounting.transactions.length + " 筆；員工：" + (value.modules.payroll?.employees?.length || 0) +
          " 人。\n會先保存整合快照；備份未包含的薪資資料將保留目前版本。")) return;
        await backup.apply(value.modules);
        status("整合資料已還原，請同步至雲端。已開啟的記帳與薪資頁面請重新整理。");
      } finally { event.target.value = ""; }
    }));
    $("operations-snapshot-list").addEventListener("click", event => {
      const button = event.target.closest("[data-operations-snapshot]");
      if (!button) return;
      task(async () => {
        await requireOwner();
        const snapshot = await window.BreakfastOperationsStore.getSnapshot(button.dataset.operationsSnapshot);
        const value = backup.validate(snapshot?.payload);
        if (!window.confirm("還原 " + time(snapshot.createdAt) + " 的整合資料？目前版本會先建立快照。")) return;
        await backup.apply(value.modules);
        status("整合快照已還原，請同步全部營運資料。");
      });
    });
    $("operations-use-cloud").addEventListener("click", () => task(async () => {
      if (!pending || !window.confirm("採用雲端版本？目前資料會先保存整合快照。")) return;
      await backup.apply(Object.fromEntries(pending.names.map(name => [name, pending.remotes[name].state])), { remotes: pending.remotes });
      pending = null; $("operations-conflict").hidden = true;
      await synchronize();
    }));
    $("operations-use-local").addEventListener("click", () => task(async () => {
      if (!pending || !window.confirm("保留本機版本並更新雲端？請先確認上方的兩個更新時間。")) return;
      await window.BreakfastOperationsStore.createSnapshot("operations", backup.collect(), { label: "保留本機版本前整合快照" });
      for (const name of pending.names) await upload(name, pending.remotes[name]);
      pending = null; $("operations-conflict").hidden = true;
      await synchronize();
    }));
    render();
    renderSnapshots().catch(error => status("救援版本暫時無法讀取：" + error.message));
    window.addEventListener("storage", render);
    window.addEventListener("breakfast-operations-restored", render);
    if (!["localhost", "127.0.0.1"].includes(location.hostname)) task(() => synchronize(true));
  });
})();
