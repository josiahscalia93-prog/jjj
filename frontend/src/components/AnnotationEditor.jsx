import { useEffect, useRef, useState } from "react";
import { Pencil, Type, ArrowUpRight, Square, Circle, Eraser, Save } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "sonner";

const COLORS = ["#FB923C", "#FDE047", "#A7F3D0", "#FBCFE8", "#93C5FD", "#0F0F0F", "#ffffff"];

export default function AnnotationEditor({ capture, refresh }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#FB923C");
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [shapes, setShapes] = useState(capture.annotations || []);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState(null);
  const [bgImg, setBgImg] = useState(null);

  // Listen for AI "Apply to canvas" events
  useEffect(() => {
    const onApply = (e) => {
      const text = e.detail?.text;
      if (!text) return;
      const cvs = canvasRef.current;
      const x = cvs ? Math.max(40, cvs.width * 0.08) : 80;
      const y = cvs ? Math.max(60, cvs.height * 0.12) : 120;
      setShapes(s => [...s, { type: "text", color: "#FB923C", text, x, y, size: 32 }]);
    };
    window.addEventListener("snapburst:apply-annotation", onApply);
    return () => window.removeEventListener("snapburst:apply-annotation", onApply);
  }, []);

  // load image
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
        img.src = url;
      } catch {}
    })();
    return () => revoked && URL.revokeObjectURL(revoked);
  }, [capture]);

  // redraw
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    let w = 1024, h = 600;
    if (bgImg) { w = bgImg.naturalWidth; h = bgImg.naturalHeight; }
    cvs.width = w; cvs.height = h;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    if (bgImg) ctx.drawImage(bgImg, 0, 0, w, h);
    [...shapes, current].filter(Boolean).forEach(s => drawShape(ctx, s));
  }, [shapes, current, bgImg]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const point = e.touches?.[0] || e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  };

  const onDown = (e) => {
    e.preventDefault();
    const p = getPos(e);
    setDrawing(true);
    if (tool === "pen") setCurrent({ type: "pen", color, w: strokeWidth, points: [p] });
    else if (tool === "text") {
      const txt = prompt("Text to add:");
      if (txt) setShapes(s => [...s, { type: "text", color, text: txt, x: p.x, y: p.y, size: 24 + strokeWidth * 2 }]);
      setDrawing(false);
    } else if (tool === "blur") setCurrent({ type: "blur", x: p.x, y: p.y, w: 0, h: 0 });
    else setCurrent({ type: tool, color, w: strokeWidth, x: p.x, y: p.y, x2: p.x, y2: p.y });
  };
  const onMove = (e) => {
    if (!drawing || !current) return;
    const p = getPos(e);
    if (current.type === "pen") setCurrent(c => ({ ...c, points: [...c.points, p] }));
    else if (current.type === "blur") setCurrent(c => ({ ...c, w: p.x - c.x, h: p.y - c.y }));
    else setCurrent(c => ({ ...c, x2: p.x, y2: p.y }));
  };
  const onUp = () => {
    setDrawing(false);
    if (current) setShapes(s => [...s, current]);
    setCurrent(null);
  };

  const undo = () => setShapes(s => s.slice(0, -1));
  const clear = () => setShapes([]);

  const save = async () => {
    try {
      await api.patch(`/captures/${capture.id}`, { annotations: shapes });
      toast.success("Annotations saved");
      refresh?.();
    } catch { toast.error("Save failed"); }
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
    <div ref={containerRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 nb p-3 bg-white">
        {tools.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTool(key)}
            className={`nb-sm px-3 py-2 text-sm flex items-center gap-1 ${tool === key ? "bg-[#FDE047]" : "bg-white"}`}
            data-testid={`tool-${key}`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        <div className="h-6 w-px bg-zinc-300 mx-2" />
        {COLORS.map(c => (
          <button key={c}
            onClick={() => setColor(c)}
            className={`w-7 h-7 rounded-full border-2 border-[#0F0F0F] ${color === c ? "ring-2 ring-offset-2 ring-[#0F0F0F]" : ""}`}
            style={{ background: c }}
            data-testid={`color-${c.slice(1)}`}
          />
        ))}
        <div className="h-6 w-px bg-zinc-300 mx-2" />
        <input type="range" min="2" max="20" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} className="w-24" data-testid="stroke-slider"/>
        <div className="ml-auto flex gap-2">
          <button onClick={undo} className="nb-btn !py-2 !px-3 text-sm" data-testid="undo-btn">Undo</button>
          <button onClick={clear} className="nb-btn !py-2 !px-3 text-sm" data-testid="clear-btn">Clear</button>
          <button onClick={save} className="nb-btn nb-btn-yellow !py-2 !px-3 text-sm" data-testid="save-annotations-btn">
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="nb bg-white p-2 overflow-auto">
        <canvas
          ref={canvasRef}
          className="w-full max-w-full block touch-none"
          style={{ cursor: tool === "text" ? "text" : "crosshair" }}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
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
    // pixelate by sampling
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
