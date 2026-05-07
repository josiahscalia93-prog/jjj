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

async function currentTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
function getQuality() { return document.querySelector('input[name="q"]:checked')?.value || "1080"; }

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

// --- selected area screenshot ---
$("cap-area").addEventListener("click", async () => {
  status("Drag to select area…");
  try {
    const tab = await currentTab();
    // 1) inject overlay and let user drag a rect
    const [{ result: rect }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => new Promise((resolve) => {
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.25);cursor:crosshair";
        const sel = document.createElement("div");
        sel.style.cssText = "position:absolute;border:2px dashed #FB923C;background:rgba(253,224,71,0.2);";
        ov.appendChild(sel);
        const tip = document.createElement("div");
        tip.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:#FDE047;color:#000;padding:6px 12px;border:2px solid #000;border-radius:8px;font-family:system-ui;font-weight:700";
        tip.textContent = "Drag to select area · Esc to cancel";
        ov.appendChild(tip);
        document.documentElement.appendChild(ov);
        let sx = 0, sy = 0, dragging = false;
        const onDown = (e) => { dragging = true; sx = e.clientX; sy = e.clientY; sel.style.left=sx+"px"; sel.style.top=sy+"px"; sel.style.width="0"; sel.style.height="0"; };
        const onMove = (e) => { if (!dragging) return; const x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy); sel.style.left=x+"px"; sel.style.top=y+"px"; sel.style.width=Math.abs(e.clientX-sx)+"px"; sel.style.height=Math.abs(e.clientY-sy)+"px"; };
        const onUp = (e) => {
          if (!dragging) return;
          const x = Math.min(e.clientX, sx), y = Math.min(e.clientY, sy);
          const w = Math.abs(e.clientX-sx), h = Math.abs(e.clientY-sy);
          cleanup(); resolve({ x, y, w, h, dpr: window.devicePixelRatio || 1 });
        };
        const onKey = (e) => { if (e.key === "Escape") { cleanup(); resolve(null); } };
        const cleanup = () => { ov.remove(); document.removeEventListener("keydown", onKey, true); };
        ov.addEventListener("mousedown", onDown);
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
        document.addEventListener("keydown", onKey, true);
      }),
    });
    if (!rect || rect.w < 4 || rect.h < 4) { status("Cancelled"); return; }
    // 2) full visible capture, then crop client-side in popup
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
    const img = await (async () => { const b = await (await fetch(dataUrl)).blob(); return await createImageBitmap(b); })();
    const dpr = rect.dpr;
    const canvas = new OffscreenCanvas(Math.round(rect.w * dpr), Math.round(rect.h * dpr));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    await uploadBlob(blob, "screenshot", (tab?.title || "Selected area") + " — area", "png");
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

async function fullPageCapture(tabId) {
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

// --- screen recording (delegated to recorder page) ---
$("rec-screen").addEventListener("click", () => {
  const q = getQuality();
  chrome.tabs.create({ url: chrome.runtime.getURL(`recorder.html?mode=screen&q=${q}`) });
});

// --- dashboard / open app ---
$("open-dashboard").addEventListener("click", () => chrome.tabs.create({ url: APP_BASE + "/dashboard" }));
$("open-app").addEventListener("click", (e) => { e.preventDefault(); chrome.tabs.create({ url: APP_BASE }); });
$("connect").addEventListener("click", () => chrome.tabs.create({ url: APP_BASE + "/login?from=extension" }));

chrome.runtime.onMessageExternal?.addListener?.((msg, sender, send) => {
  if (msg?.type === "snapburst-token" && msg.token) { setToken(msg.token); send({ ok: true }); }
});

(async () => { await refreshAuthBanner(); await renderRecent(); })();
