// SnapBurst background service worker
chrome.runtime.onInstalled.addListener(() => {
  console.log("SnapBurst installed");
});

chrome.commands?.onCommand?.addListener?.(async (command) => {
  if (command === "capture-visible") {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    chrome.storage.local.set({ pending_capture: dataUrl });
    chrome.action.openPopup?.();
  } else if (command === "start-recording") {
    chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html?mode=screen") });
  }
});

chrome.runtime.onMessageExternal?.addListener?.((msg, sender, send) => {
  if (msg?.type === "snapburst-token" && msg.token) {
    chrome.storage.local.set({ sb_token: msg.token });
    send({ ok: true });
  }
  return true;
});
