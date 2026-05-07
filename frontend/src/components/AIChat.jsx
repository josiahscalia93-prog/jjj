import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Sparkles, Send, X, ImagePlus, Bot, Wand2 } from "lucide-react";
import { toast } from "sonner";

const SESSION_KEY = "sb_chat_session_id";

export default function AIChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [messages, setMessages] = useState([
    { id: "init_assistant", role: "assistant", text: "Hey! I'm your SnapBurst assistant. Ask me anything about screen capture, annotations, sharing — or drop a screenshot for tips ✨" },
  ]);
  const [sending, setSending] = useState(false);
  const sessionId = useRef(localStorage.getItem(SESSION_KEY) || `chat_${Math.random().toString(36).slice(2, 12)}`);
  const scroller = useRef(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // persist session id
  useEffect(() => { localStorage.setItem(SESSION_KEY, sessionId.current); }, []);

  // load history once on open
  useEffect(() => {
    if (!open || historyLoaded || !user) return;
    (async () => {
      try {
        const { data } = await api.get(`/ai/history/${sessionId.current}`);
        if (Array.isArray(data) && data.length) {
          setMessages(data.map((d, i) => ({
            id: `hist_${i}_${d.created_at || Date.now()}`,
            role: d.role,
            text: d.text,
            image: d.has_image,
          })));
        }
      } catch (err) {
        console.warn("chat history load failed:", err?.message || err);
      }
      setHistoryLoaded(true);
    })();
  }, [open, historyLoaded, user]);

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9 }); }, [messages, open]);

  if (!user) return null;

  const send = async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    const userMsgId = `u_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    setMessages(m => [...m, { id: userMsgId, role: "user", text: text || "(image)", image: pendingImage }]);
    setInput("");
    setSending(true);
    try {
      const { data } = await api.post("/ai/chat", {
        message: text || "Please analyze this screenshot and suggest annotations.",
        session_id: sessionId.current,
        image_base64: pendingImage,
        image_mime: "image/png",
      });
      setMessages(m => [...m, { id: `a_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, role: "assistant", text: data.reply }]);
    } catch (e) {
      console.warn("ai chat send failed:", e?.message || e);
      setMessages(m => [...m, { id: `err_${Date.now()}`, role: "assistant", text: "Sorry, I had trouble responding. Try again?" }]);
    } finally {
      setSending(false);
      setPendingImage(null);
    }
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  };

  const applySuggestion = (text) => {
    // distill the assistant text into a short call-out (first sentence, max 80 chars)
    const short = (text.split(/[.!?]\s/)[0] || text).trim().slice(0, 80);
    const fired = window.dispatchEvent(new CustomEvent("snapburst:apply-annotation", { detail: { text: short } }));
    if (fired) toast.success("AI suggestion applied to canvas");
  };

  const newSession = () => {
    sessionId.current = `chat_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(SESSION_KEY, sessionId.current);
    setMessages([{ id: "init_new", role: "assistant", text: "Fresh start — what do you want to capture today?" }]);
    setHistoryLoaded(true);
  };

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-6 right-6 z-50 nb-btn nb-btn-tangerine !px-5 !py-4 !rounded-full hover-wiggle"
        data-testid="ai-toggle-btn"
      >
        <Sparkles size={18} /> <span className="hidden sm:inline">Ask AI</span>
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[min(92vw,420px)] h-[600px] nb bg-white flex flex-col overflow-hidden" data-testid="ai-chat-panel">
          <div className="px-4 py-3 bg-[#FDE047] border-b-2 border-[#0F0F0F] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#0F0F0F] grid place-items-center">
                <Bot size={16} className="text-[#FDE047]" />
              </div>
              <div>
                <div className="font-bold text-sm">SnapBurst AI</div>
                <div className="text-[11px] font-mono-accent">GPT-5.2 · vision</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={newSession} className="text-xs underline" data-testid="ai-new-chat">New chat</button>
              <button onClick={() => setOpen(false)} aria-label="Close" data-testid="ai-close-btn"><X size={18} /></button>
            </div>
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAFAFA]">
            {messages.map((m, i) => (
              <div key={m.id || `msg-${i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] nb-sm px-3 py-2 text-sm ${m.role === "user" ? "bg-[#A7F3D0]" : "bg-white"}`}>
                  {m.image && <div className="text-[11px] mb-1 font-mono-accent opacity-70">📷 image attached</div>}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                  {m.role === "assistant" && i > 0 && (
                    <button onClick={() => applySuggestion(m.text)} className="mt-2 nb-sm px-2 py-1 bg-[#FDE047] text-xs flex items-center gap-1" data-testid={`apply-suggestion-${m.id || i}`}>
                      <Wand2 size={11}/> Apply to canvas
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && <div className="text-xs text-zinc-500 font-mono-accent">thinking…</div>}
          </div>

          {pendingImage && (
            <div className="px-3 py-2 border-t-2 border-[#0F0F0F] bg-[#FBCFE8] flex items-center justify-between text-xs">
              <span>Image queued for next message</span>
              <button onClick={() => setPendingImage(null)}><X size={14} /></button>
            </div>
          )}

          <div className="p-3 border-t-2 border-[#0F0F0F] flex items-center gap-2 bg-white">
            <label className="cursor-pointer nb-sm px-2 py-2 bg-white" data-testid="ai-image-btn">
              <ImagePlus size={16} />
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onPickImage} />
            </label>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Ask anything about SnapBurst…"
              className="flex-1 nb-input !py-2 !text-sm"
              data-testid="ai-input"
            />
            <button onClick={send} disabled={sending} className="nb-btn nb-btn-tangerine !px-3 !py-2" data-testid="ai-send-btn">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
