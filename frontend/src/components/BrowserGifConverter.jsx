import { useRef, useState } from "react";
import { FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const FFMPEG_CDN = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

/**
 * Browser-side WebM → GIF transcoder using ffmpeg.wasm (single-threaded).
 * No SharedArrayBuffer / COOP-COEP required.
 *
 * Falls back gracefully: if wasm load fails, calls the server-side endpoint.
 */
export default function BrowserGifConverter({ capture, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const ffmpegRef = useRef(null);

  const loadFfmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    setStage("Loading transcoder…");
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("progress", ({ progress: p }) => {
      if (typeof p === "number") setProgress(Math.min(99, Math.round(p * 100)));
    });
    await ff.load({
      coreURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FFMPEG_CDN}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffmpegRef.current = ff;
    return ff;
  };

  const fallbackServer = async () => {
    setStage("Server transcoding…");
    const { data } = await api.post(`/captures/${capture.id}/to-gif`);
    return data;
  };

  const run = async () => {
    setBusy(true);
    setProgress(0);
    setStage("Starting…");
    try {
      let ff;
      try {
        ff = await loadFfmpeg();
      } catch (e) {
        console.warn("ffmpeg.wasm load failed, using server fallback", e);
        const data = await fallbackServer();
        toast.success("GIF created (server)", {
          action: { label: "Open", onClick: () => onCreated?.(data) },
        });
        return;
      }

      setStage("Downloading source…");
      const r = await api.get(`/captures/${capture.id}/file`, { responseType: "blob" });
      const buf = new Uint8Array(await r.data.arrayBuffer());

      setStage("Writing input…");
      await ff.writeFile("in.webm", buf);

      setStage("Generating palette…");
      await ff.exec([
        "-i", "in.webm",
        "-vf", "fps=12,scale=720:-1:flags=lanczos,palettegen",
        "palette.png",
      ]);

      setStage("Encoding GIF…");
      await ff.exec([
        "-i", "in.webm",
        "-i", "palette.png",
        "-lavfi", "fps=12,scale=720:-1:flags=lanczos [x]; [x][1:v] paletteuse",
        "out.gif",
      ]);

      setStage("Uploading…");
      const out = await ff.readFile("out.gif");
      const blob = new Blob([out.buffer], { type: "image/gif" });

      const fd = new FormData();
      fd.append("file", blob, `${capture.title || "capture"}.gif`);
      fd.append("title", `${capture.title} — GIF`);
      fd.append("kind", "screenshot");
      const { data: created } = await api.post("/captures", fd);
      setProgress(100);
      toast.success("GIF created in browser", {
        action: { label: "Open", onClick: () => onCreated?.(created) },
      });
    } catch (e) {
      console.error(e);
      // last-resort server fallback
      try {
        const data = await fallbackServer();
        toast.success("GIF created (server fallback)", {
          action: { label: "Open", onClick: () => onCreated?.(data) },
        });
      } catch (e2) {
        toast.error(e2?.response?.data?.detail || "GIF conversion failed");
      }
    } finally {
      setBusy(false);
      setStage("");
      setProgress(0);
    }
  };

  return (
    <div className="inline-flex items-center gap-2" data-testid="browser-gif-converter">
      <button
        onClick={run}
        disabled={busy}
        className="nb-btn nb-btn-mint !py-2 !px-3 text-sm"
        data-testid="convert-gif-browser-btn"
        title="Transcode to GIF locally with ffmpeg.wasm"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FileImage size={14} />}
        {busy ? `${stage} ${progress}%` : "Convert to GIF"}
      </button>
      {busy && (
        <div className="hidden sm:block w-32 h-2 nb-sm bg-white overflow-hidden" data-testid="gif-progress">
          <div className="h-full bg-[#0F0F0F]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}
