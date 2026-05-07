import { useEffect, useState } from "react";
import { Pencil, Type, ArrowUpRight, Square, Circle, Eraser, Save } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";
import { useCanvasOps } from "../lib/useCanvasOps";

const COLORS = ["#FB923C", "#FDE047", "#A7F3D0", "#FBCFE8", "#93C5FD", "#0F0F0F", "#ffffff"];

export default function AnnotationEditor({ capture, refresh }) {
  const ops = useCanvasOps(capture.annotations || []);
  const [bgImg, setBgImg] = useState(null);

  // Load background image
  useEffect(() => {
    if (!capture || capture.kind !== "screenshot") return;
    let revoked = null;
    (async () => {
      try {
        const r = await api.get(`/captures/${capture.id}/file`, { responseType: "blob" });
        const url = URL.createObjectURL(r.data);
        revoked = url;
        const img = new Image();
        img.onload = () => setBgImg(img);
        img.onerror = (e) => console.warn("bg image decode failed:", e);
        img.src = url;
      } catch (err) {
        console.warn("annotation bg fetch failed:", err?.message || err);
      }
    })();
    return () => revoked && URL.revokeObjectURL(revoked);
  }, [capture]);

  // Redraw whenever shapes / current / bg change
  useEffect(() => {
    const cvs = ops.canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    let w = 1024, h = 600;
    if (bgImg) { w = bgImg.naturalWidth; h = bgImg.naturalHeight; }
    cvs.width = w; cvs.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    [...ops.shapes, ops.current].filter(Boolean).forEach((s) => drawShape(ctx, s));
  }, [ops.shapes, ops.current, bgImg, ops.canvasRef]);

  const save = async () => {
    try {
      await api.patch(`/captures/${capture.id}`, { annotations: ops.shapes });
      toast.success("Annotations saved");
      refresh?.();
    } catch (err) {
      console.warn("annotation save failed:", err?.message || err);
      toast.error("Save failed");
    }
  };

  const tools = [
    { key: "pen", icon: Pencil, label: "Draw" },
    { key: "arrow", icon: ArrowUpRight, label: "Arrow" },
    { key: "rect", icon: Square, label: "Rect" },
    { key: "circle", icon: Circle, label: "Circle" },
    { key: "text", icon: Type, label: "Text" },
    { key: "blur", icon: Eraser, label: "Blur" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 nb p-3 bg-white">
        {tools.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => ops.setTool(key)}
            className={`nb-sm px-3 py-2 text-sm flex items-center gap-1 ${ops.tool === key ? "bg-[#FDE047]" : "bg-white"}`}
            data-testid={`tool-${key}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <div className="h-6 w-px bg-zinc-300 mx-2" />
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => ops.setColor(c)}
            className={`w-7 h-7 rounded-full border-2 border-[#0F0F0F] ${ops.color === c ? "ring-2 ring-offset-2 ring-[#0F0F0F]" : ""}`}
            style={{ background: c }}
            data-testid={`color-${c.slice(1)}`}
          />
        ))}
        <div className="h-6 w-px bg-zinc-300 mx-2" />
        <input type="range" min="2" max="20" value={ops.strokeWidth} onChange={(e) => ops.setStrokeWidth(Number(e.target.value))} className="w-24" data-testid="stroke-slider" />
        <div className="ml-auto flex gap-2">
          <button onClick={ops.undo} className="nb-btn !py-2 !px-3 text-sm" data-testid="undo-btn">Undo</button>
          <button onClick={ops.clear} className="nb-btn !py-2 !px-3 text-sm" data-testid="clear-btn">Clear</button>
          <button onClick={save} className="nb-btn nb-btn-yellow !py-2 !px-3 text-sm" data-testid="save-annotations-btn">
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="nb bg-white p-2 overflow-auto">
        <canvas
          ref={ops.canvasRef}
          className="w-full max-w-full block touch-none"
          style={{ cursor: ops.tool === "text" ? "text" : "crosshair" }}
          onMouseDown={ops.onDown} onMouseMove={ops.onMove} onMouseUp={ops.onUp} onMouseLeave={ops.onUp}
          onTouchStart={ops.onDown} onTouchMove={ops.onMove} onTouchEnd={ops.onUp}
          data-testid="annotation-canvas"
        />
      </div>
    </div>
  );
}

function drawShape(ctx, s) {
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = s.color || "#FB923C";
  ctx.fillStyle = s.color || "#FB923C";
  ctx.lineWidth = s.w || 5;
  if (s.type === "pen") {
    ctx.beginPath();
    s.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  } else if (s.type === "rect") {
    ctx.strokeRect(s.x, s.y, s.x2 - s.x, s.y2 - s.y);
  } else if (s.type === "circle") {
    const r = Math.hypot(s.x2 - s.x, s.y2 - s.y);
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
  } else if (s.type === "arrow") {
    const dx = s.x2 - s.x, dy = s.y2 - s.y;
    const ang = Math.atan2(dy, dx);
    const head = 12 + (s.w || 5) * 1.5;
    ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x2, s.y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x2, s.y2);
    ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI/7), s.y2 - head * Math.sin(ang - Math.PI/7));
    ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI/7), s.y2 - head * Math.sin(ang + Math.PI/7));
    ctx.closePath(); ctx.fill();
  } else if (s.type === "text") {
    ctx.font = `bold ${s.size || 28}px Outfit, sans-serif`;
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, s.x, s.y);
  } else if (s.type === "blur") {
    const x = Math.min(s.x, s.x + s.w), y = Math.min(s.y, s.y + s.h);
    const w = Math.abs(s.w), h = Math.abs(s.h);
    if (!w || !h) return;
    const data = ctx.getImageData(x, y, w, h);
    const block = 12;
    const c2 = document.createElement("canvas"); c2.width = w; c2.height = h;
    const c2x = c2.getContext("2d"); c2x.putImageData(data, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c2, 0, 0, w, h, x, y, Math.ceil(w / block) * block, Math.ceil(h / block) * block);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(c2, 0, 0, Math.ceil(w/block), Math.ceil(h/block), x, y, w, h);
  }
}
