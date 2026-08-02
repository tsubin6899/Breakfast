(() => {
  const localHosts = new Set(["127.0.0.1", "localhost"]);
  window.BREAKFAST_LOCAL_MODE = localHosts.has(window.location.hostname);
})();
