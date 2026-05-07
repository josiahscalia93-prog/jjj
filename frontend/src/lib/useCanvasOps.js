/**
 * Custom hook owning the annotation canvas state machine: shapes list,
 * tool/color/stroke, drag-draw lifecycle, and the apply-annotation event bridge.
 */
import { useEffect, useRef, useState, useCallback } from "react";

export function useCanvasOps(initialShapes = []) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState("pen");
  const [color, setColor] = useState("#FB923C");
  const [strokeWidth, setStrokeWidth] = useState(5);
  const [shapes, setShapes] = useState(initialShapes);
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState(null);

  // Listen for AI "Apply to canvas" events emitted by the chat widget.
  useEffect(() => {
    const onApply = (e) => {
      const text = e.detail?.text;
      if (!text) return;
      const cvs = canvasRef.current;
      const x = cvs ? Math.max(40, cvs.width * 0.08) : 80;
      const y = cvs ? Math.max(60, cvs.height * 0.12) : 120;
      setShapes((s) => [...s, { type: "text", color: "#FB923C", text, x, y, size: 32 }]);
    };
    window.addEventListener("snapburst:apply-annotation", onApply);
    return () => window.removeEventListener("snapburst:apply-annotation", onApply);
  }, []);

  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const point = e.touches?.[0] || e;
    return { x: (point.clientX - rect.left) * scaleX, y: (point.clientY - rect.top) * scaleY };
  }, []);

  const onDown = useCallback(
    (e) => {
      e.preventDefault();
      const p = getPos(e);
      setDrawing(true);
      if (tool === "pen") setCurrent({ type: "pen", color, w: strokeWidth, points: [p] });
      else if (tool === "text") {
        const txt = prompt("Text to add:");
        if (txt) setShapes((s) => [...s, { type: "text", color, text: txt, x: p.x, y: p.y, size: 24 + strokeWidth * 2 }]);
        setDrawing(false);
      } else if (tool === "blur") setCurrent({ type: "blur", x: p.x, y: p.y, w: 0, h: 0 });
      else setCurrent({ type: tool, color, w: strokeWidth, x: p.x, y: p.y, x2: p.x, y2: p.y });
    },
    [tool, color, strokeWidth, getPos],
  );

  const onMove = useCallback(
    (e) => {
      if (!drawing || !current) return;
      const p = getPos(e);
      if (current.type === "pen") setCurrent((c) => ({ ...c, points: [...c.points, p] }));
      else if (current.type === "blur") setCurrent((c) => ({ ...c, w: p.x - c.x, h: p.y - c.y }));
      else setCurrent((c) => ({ ...c, x2: p.x, y2: p.y }));
    },
    [drawing, current, getPos],
  );

  const onUp = useCallback(() => {
    setDrawing(false);
    if (current) setShapes((s) => [...s, current]);
    setCurrent(null);
  }, [current]);

  const undo = useCallback(() => setShapes((s) => s.slice(0, -1)), []);
  const clear = useCallback(() => setShapes([]), []);

  return {
    canvasRef,
    tool, setTool,
    color, setColor,
    strokeWidth, setStrokeWidth,
    shapes, setShapes,
    current,
    onDown, onMove, onUp,
    undo, clear,
  };
}
