(() => {
  "use strict";

  const RETRY_DELAYS = [1200, 3500, 9000];

  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }

  function isRetryable(error) {
    const status = Number(error?.status || 0);
    return !status || status === 408 || status === 425 || status === 429 || status >= 500;
  }

  function retryDelay(attempt) {
    return RETRY_DELAYS[Math.min(Math.max(0, attempt), RETRY_DELAYS.length - 1)];
  }

  async function requestJson(url, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || 3));
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const offlineError = new Error("目前沒有網路，資料已保留在本機，連線後會自動同步。");
        offlineError.code = "OFFLINE";
        throw offlineError;
      }
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), Number(options.timeout || 20_000));
      try {
        const response = await fetch(url, {
          method: options.method || "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: options.headers || {},
          body: options.body,
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new Error(payload.message || `雲端服務回應錯誤（${response.status}）`);
          error.status = response.status;
          error.code = payload.error || "";
          error.payload = payload;
          throw error;
        }
        return payload;
      } catch (error) {
        lastError = error?.name === "AbortError"
          ? Object.assign(new Error("雲端連線逾時，系統稍後會自動重試。"), { code: "TIMEOUT" })
          : error;
        if (attempt >= attempts - 1 || !isRetryable(lastError)) throw lastError;
        await sleep(retryDelay(attempt));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw lastError;
  }

  function relativeTime(value) {
    const timestamp = Date.parse(value || "");
    if (!Number.isFinite(timestamp)) return "尚未完成";
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
    if (minutes < 1) return "剛剛";
    if (minutes < 60) return `${minutes} 分鐘前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
    return `${Math.floor(minutes / 1440)} 天前`;
  }

  window.BreakfastCloudSync = { isRetryable, requestJson, retryDelay, relativeTime };
})();
