const APP_BASE = "https://capture-annotate.preview.emergentagent.com";
const API = APP_BASE + "/api";
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "screen";

let mediaRecorder, chunks = [], stream;
const $ = (id) => document.getElementById(id);
const status = (m) => $("status").textContent = m;

async function getToken() {
  const { sb_token } = await chrome.storage.local.get("sb_token");
  return sb_token || null;
}

async function start() {
  chunks = [];
  try {
    if (mode === "cam") {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      // optionally add mic
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch {}
    }
  } catch (e) { status("Permission denied"); return; }
  const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = onStop;
  mr.start(1000);
  mediaRecorder = mr;
  $("start").style.display = "none";
  $("stop").style.display = "inline-block";
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
  fd.append("file", new File([blob], "rec.webm", { type: "video/webm" }));
  fd.append("kind", "recording");
  fd.append("title", "SnapBurst recording " + new Date().toLocaleString());
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
