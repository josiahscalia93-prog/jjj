// SnapBurst popup logic
const APP_BASE = "https://capture-annotate.preview.emergentagent.com";
const API = APP_BASE + "/api";

const $ = (id) => document.getElementById(id);
const status = (m) => { $("status").textContent = m || ""; };

async function getToken() {
  const { sb_token } = await chrome.storage.local.get("sb_token");
  return sb_token || null;
}
async function setToken(t) { await chrome.storage.local.set({ sb_token: t }); }

async function refreshAuthBanner() {
  const t = await getToken();
  $("auth-banner").classList.toggle("hide", !!t);
}

async function uploadBlob(blob, kind, title, ext, durationSec) {
  const token = await getToken();
  if (!token) {
    chrome.tabs.create({ url: `${APP_BASE}/login?from=extension` });
    return;
  }
  const fd = new FormData();
  fd.append("file", new File([blob], `capture.${ext}`, { type: blob.type || "application/octet-stream" }));
  fd.append("kind", kind);
  fd.append("title", title || "Untitled");
  if (durationSec != null) fd.append("duration_sec", String(durationSec));
  status("Uploading…");
  const r = await fetch(`${API}/captures`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) { status(`Upload failed (${r.status})`); return; }
  const cap = await r.json();
  status("Uploaded ✓");
  await pushRecent(cap);
  // open share page
  chrome.tabs.create({ url: `${APP_BASE}/capture/${cap.id}` });
}

async function pushRecent(cap) {
  const { sb_recent = [] } = await chrome.storage.local.get("sb_recent");
  sb_recent.unshift({ id: cap.id, title: cap.title, kind: cap.kind, share: cap.share_token, ts: Date.now() });
  await chrome.storage.local.set({ sb_recent: sb_recent.slice(0, 5) });
  renderRecent();
}

async function renderRecent() {
  const { sb_recent = [] } = await chrome.storage.local.get("sb_recent");
  const el = $("recent-list");
  if (!sb_recent.length) { el.innerHTML = '<div class="empty">Nothing yet — make your first capture!</div>'; return; }
  el.innerHTML = sb_recent.map(r => `
    <div class="recent-row">
      <span>${r.kind === "recording" ? "🎬" : "🖼"} ${escapeHtml(r.title)}</span>
      <a href="${APP_BASE}/share/${r.share}" target="_blank">share</a>
    </div>`).join("");
}
function escapeHtml(s){return (s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}

// --- visible area screenshot ---
$("cap-visible").addEventListener("click", async () => {
  status("Capturing…");
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    const blob = await (await fetch(dataUrl)).blob();
    const tab = await currentTab();
    await uploadBlob(blob, "screenshot", tab?.title || "Visible area", "png");
  } catch (e) { status("Capture failed"); console.error(e); }
});

// --- full page (scrolling) ---
$("cap-full").addEventListener("click", async () => {
  status("Full page capture…");
  try {
    const tab = await currentTab();
    const blob = await fullPageCapture(tab.id);
    await uploadBlob(blob, "screenshot", (tab?.title || "Full page") + " — full", "png");
  } catch (e) { status("Capture failed"); console.error(e); }
});

async function currentTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}

async function fullPageCapture(tabId) {
  // get scroll metrics
  const [{ result: dims }] = await chrome.scripting.executeScript({
    target: { tabId }, func: () => ({
      total: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      view: window.innerHeight, width: window.innerWidth, dpr: window.devicePixelRatio || 1,
    })
  });
  const slices = [];
  let y = 0;
  while (y < dims.total) {
    await chrome.scripting.executeScript({ target: { tabId }, func: (yy) => window.scrollTo(0, yy), args: [y] });
    await new Promise(r => setTimeout(r, 350));
    const url = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    slices.push({ url, y });
    y += dims.view;
  }
  await chrome.scripting.executeScript({ target: { tabId }, func: () => window.scrollTo(0, 0) });
  // stitch
  const imgs = await Promise.all(slices.map(s => loadImg(s.url)));
  const w = imgs[0].width;
  const totalPx = Math.ceil(dims.total * dims.dpr);
  const canvas = new OffscreenCanvas(w, totalPx);
  const ctx = canvas.getContext("2d");
  imgs.forEach((img, i) => {
    const sliceY = Math.round(slices[i].y * dims.dpr);
    const drawH = Math.min(img.height, totalPx - sliceY);
    ctx.drawImage(img, 0, 0, w, drawH, 0, sliceY, w, drawH);
  });
  return await canvas.convertToBlob({ type: "image/png" });
}
function loadImg(url) { return new Promise(async (res) => {
  const blob = await (await fetch(url)).blob();
  const bm = await createImageBitmap(blob); res(bm);
});}

// --- screen recording (delegated to offscreen via tab) ---
$("rec-screen").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html?mode=screen") });
});
$("rec-cam").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html?mode=cam") });
});

// --- dashboard / open app ---
$("open-dashboard").addEventListener("click", () => chrome.tabs.create({ url: APP_BASE + "/dashboard" }));
$("open-app").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: APP_BASE }); });
$("connect").addEventListener("click", () => chrome.tabs.create({ url: APP_BASE + "/login?from=extension" }));

// listen for token push from web app
chrome.runtime.onMessageExternal?.addListener?.((msg, sender, send) => {
  if (msg?.type === "snapburst-token" && msg.token) { setToken(msg.token); send({ ok: true }); }
});

(async () => { await refreshAuthBanner(); await renderRecent(); })();
