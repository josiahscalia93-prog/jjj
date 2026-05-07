const APP_BASE = "https://capture-annotate.preview.emergentagent.com";
const API = APP_BASE + "/api";
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "screen";
const q = params.get("q") || "1080";

const QUALITY = {
  "1080": { w: 1920, h: 1080, vbps: 5_000_000 },
  "1440": { w: 2560, h: 1440, vbps: 9_000_000 },
  "2160": { w: 3840, h: 2160, vbps: 18_000_000 },
  "gif":  { w: 800,  h: 600,  vbps: 1_500_000, fps: 8, noAudio: true, gif: true },
}[q] || { w: 1920, h: 1080, vbps: 5_000_000 };

let mediaRecorder, chunks = [], stream;
const $ = (id) => document.getElementById(id);
const status = (m) => $("status").textContent = m;

async function getToken() {
  const { sb_token } = await chrome.storage.local.get("sb_token");
  return sb_token || null;
}

async function start() {
  chunks = [];
  status(`Starting (${q === "gif" ? "GIF preset" : q + "p"})…`);
  try {
    const constraints = {
      video: {
        width:  { ideal: QUALITY.w },
        height: { ideal: QUALITY.h },
        frameRate: QUALITY.fps ? { ideal: QUALITY.fps, max: QUALITY.fps } : undefined,
      },
      audio: !QUALITY.noAudio,
    };
    stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    if (!QUALITY.noAudio) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch {}
    }
  } catch (e) { status("Permission denied"); return; }

  const mimeOptions = QUALITY.gif
    ? "video/webm;codecs=vp9"
    : "video/webm;codecs=vp9,opus";
  const mr = new MediaRecorder(stream, { mimeType: mimeOptions, videoBitsPerSecond: QUALITY.vbps });
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = onStop;
  mr.start(1000);
  mediaRecorder = mr;
  $("start").style.display = "none";
  $("stop").style.display = "inline-block";
  $("preset").textContent = q === "gif" ? "GIF preset (no audio)" : `${q === "2160" ? "4K" : q === "1440" ? "2K" : q + "p"} · ${(QUALITY.vbps/1_000_000).toFixed(1)} Mbps`;
  status("Recording…");
  stream.getVideoTracks()[0].addEventListener("ended", () => mr.state !== "inactive" && mr.stop());
}

async function onStop() {
  stream?.getTracks().forEach(t => t.stop());
  const blob = new Blob(chunks, { type: "video/webm" });
  $("prev").src = URL.createObjectURL(blob);
  status("Uploading…");
  const token = await getToken();
  if (!token) { chrome.tabs.create({ url: APP_BASE + "/login?from=extension" }); return; }
  const fd = new FormData();
  const ext = "webm";
  fd.append("file", new File([blob], `rec.${ext}`, { type: "video/webm" }));
  fd.append("kind", "recording");
  const label = q === "gif" ? "GIF" : (q === "2160" ? "4K" : q === "1440" ? "2K" : q + "p");
  fd.append("title", `SnapBurst ${label} — ${new Date().toLocaleString()}`);
  const r = await fetch(API + "/captures", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!r.ok) { status("Upload failed: " + r.status); return; }
  const cap = await r.json();
  status("Uploaded ✓ Opening dashboard…");
  setTimeout(() => chrome.tabs.update({ url: APP_BASE + "/capture/" + cap.id }), 600);
}

$("start").addEventListener("click", start);
$("stop").addEventListener("click", () => mediaRecorder?.stop());
