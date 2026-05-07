// SnapBurst — content script that auto-connects extension after web login.
// Reads sb_token from web app localStorage and stores it in chrome.storage so the popup can use it.
(function () {
  function sync() {
    try {
      const t = localStorage.getItem("sb_token");
      if (t) {
        chrome.storage.local.set({ sb_token: t });
      }
    } catch (e) { /* ignore */ }
  }
  sync();
  setInterval(sync, 5000);
  window.addEventListener("storage", sync);
})();
