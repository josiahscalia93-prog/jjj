// SnapBurst background service worker (MV3)
const APP_BASE = "https://capture-annotate.preview.emergentagent.com";

chrome.runtime.onInstalled.addListener(() => {
  console.log("SnapBurst installed");
});

// Global keyboard shortcut handlers.
// chrome.action.openPopup() is unreliable from a command in MV3,
// so we capture immediately and notify the user.
chrome.commands?.onCommand?.addListener?.(async (command) => {
  try {
    if (command === "capture-visible") {
      const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
      await chrome.storage.local.set({ pending_capture: dataUrl, pending_at: Date.now() });
      // Try to upload immediately if a token is set
      const { sb_token } = await chrome.storage.local.get("sb_token");
      if (sb_token) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const fd = new FormData();
          fd.append("file", new File([blob], "shortcut.png", { type: "image/png" }));
          fd.append("kind", "screenshot");
          fd.append("title", "Quick capture (Ctrl+Shift+S)");
          const r = await fetch(`${APP_BASE}/api/captures`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sb_token}` },
            body: fd,
          });
          if (r.ok) {
            const cap = await r.json();
            chrome.notifications.create("snap_ready_" + cap.id, {
              type: "basic",
              iconUrl: "icons/icon48.png",
              title: "SnapBurst — Screenshot saved",
              message: "Click to open in dashboard.",
              priority: 2,
            });
            chrome.storage.local.set({ last_capture_id: cap.id });
            return;
          }
        } catch (e) { /* fall through to local notify */ }
      }
      chrome.notifications.create("snap_ready", {
        type: "basic",
        iconUrl: "icons/icon48.png",
        title: "SnapBurst — Screenshot ready",
        message: "Click the SnapBurst icon to upload, annotate or download.",
        priority: 2,
      });
    } else if (command === "start-recording") {
      chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html?mode=screen") });
    }
  } catch (e) {
    console.error("command handler failed", e);
  }
});

// Open the dashboard / capture page when notification clicked
chrome.notifications?.onClicked?.addListener?.(async (id) => {
  const { last_capture_id } = await chrome.storage.local.get("last_capture_id");
  if (id.startsWith("snap_ready_") && last_capture_id) {
    chrome.tabs.create({ url: `${APP_BASE}/capture/${last_capture_id}` });
  } else {
    chrome.action.openPopup?.();
  }
  chrome.notifications.clear(id);
});

// Receive token from web app (when externally_connectable is added in future)
chrome.runtime.onMessageExternal?.addListener?.((msg, sender, send) => {
  if (msg?.type === "snapburst-token" && msg.token) {
    chrome.storage.local.set({ sb_token: msg.token });
    send({ ok: true });
  }
  return true;
});
