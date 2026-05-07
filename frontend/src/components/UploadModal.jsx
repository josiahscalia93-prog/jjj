import { useRef, useState } from "react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { Camera, Video, Mic, MonitorSmartphone, X, Upload } from "lucide-react";

export default function UploadModal({ open, onClose, onCreated }) {
  const fileInputRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recRef = useRef({ chunks: [], stream: null, recorder: null, started: 0 });

  if (!open) return null;

  const upload = async (blob, kind, title, ext, durationSec) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `capture.${ext}`, { type: blob.type }));
      fd.append("kind", kind);
      fd.append("title", title);
      if (durationSec != null) fd.append("duration_sec", String(durationSec));
      const { data } = await api.post("/captures", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Uploaded ✓");
      onCreated?.(data);
      onClose();
    } catch (e) { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isVideo = f.type.startsWith("video/");
    const ext = (f.name.split(".").pop() || (isVideo ? "webm" : "png")).toLowerCase();
    await upload(f, isVideo ? "recording" : "screenshot", f.name.replace(/\.[^.]+$/, ""), ext);
  };

  const startScreenRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => stream.addTrack(t));
      } catch {}
      const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
      recRef.current = { chunks: [], stream, recorder: rec, started: Date.now() };
      rec.ondataavailable = ev => ev.data.size && recRef.current.chunks.push(ev.data);
      rec.onstop = async () => {
        const dur = (Date.now() - recRef.current.started) / 1000;
        const blob = new Blob(recRef.current.chunks, { type: "video/webm" });
        recRef.current.stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        await upload(blob, "recording", `Recording ${new Date().toLocaleString()}`, "webm", dur);
      };
      stream.getVideoTracks()[0].addEventListener("ended", () => rec.state !== "inactive" && rec.stop());
      rec.start(1000);
      setRecording(true);
    } catch { toast.error("Permission denied"); }
  };
  const stopRecord = () => recRef.current.recorder?.stop();

  const captureWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const v = document.createElement("video");
      v.srcObject = stream; await v.play();
      await new Promise(r => setTimeout(r, 800));
      const cvs = document.createElement("canvas");
      cvs.width = v.videoWidth; cvs.height = v.videoHeight;
      cvs.getContext("2d").drawImage(v, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      cvs.toBlob(b => upload(b, "screenshot", `Webcam ${new Date().toLocaleString()}`, "png"), "image/png");
    } catch { toast.error("Camera access denied"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="nb-lg bg-white max-w-2xl w-full p-6 sm:p-8 fade-up" onClick={e => e.stopPropagation()} data-testid="upload-modal">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-mono mb-1">New capture</div>
            <h2 className="text-3xl font-display font-bold">Make something share-worthy</h2>
          </div>
          <button onClick={onClose} className="nb-sm w-10 h-10 grid place-items-center bg-white" data-testid="close-upload">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button onClick={() => fileInputRef.current?.click()} className="nb-lg p-5 bg-[#FDE047] text-left" data-testid="upload-file-btn">
            <Upload className="mb-3" /><div className="font-bold text-lg">Upload file</div>
            <div className="text-sm opacity-70">Image or video from your device</div>
          </button>
          <button onClick={captureWebcam} className="nb-lg p-5 bg-[#FBCFE8] text-left" data-testid="webcam-shot-btn">
            <Camera className="mb-3" /><div className="font-bold text-lg">Webcam snapshot</div>
            <div className="text-sm opacity-70">Quick photo from your camera</div>
          </button>
          {!recording ? (
            <button onClick={startScreenRecord} className="nb-lg p-5 bg-[#A7F3D0] text-left sm:col-span-2" data-testid="start-record-btn">
              <Video className="mb-3" /><div className="font-bold text-lg">Record screen + mic</div>
              <div className="text-sm opacity-70">Choose a tab/window/desktop. Webm output.</div>
            </button>
          ) : (
            <button onClick={stopRecord} className="nb-lg p-5 bg-[#FB923C] text-left sm:col-span-2 animate-pulse" data-testid="stop-record-btn">
              <MonitorSmartphone className="mb-3" /><div className="font-bold text-lg">Stop & upload</div>
              <div className="text-sm opacity-70">Recording in progress…</div>
            </button>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={onPickFile} />
        {uploading && <div className="mt-4 label-mono">Uploading…</div>}
      </div>
    </div>
  );
}
