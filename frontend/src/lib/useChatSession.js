/**
 * Custom hook that owns AI chat session lifecycle:
 * sessionId persistence, message list, history loading, send/receive, and reset.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api";

const SESSION_KEY = "sb_chat_session_id";
const INITIAL_GREETING =
  "Hey! I'm your SnapBurst assistant. Ask me anything about screen capture, annotations, sharing — or drop a screenshot for tips ✨";

export function useChatSession({ enabled = true } = {}) {
  const sessionIdRef = useRef(
    localStorage.getItem(SESSION_KEY) || `chat_${Math.random().toString(36).slice(2, 12)}`,
  );
  const [messages, setMessages] = useState([
    { id: "init_assistant", role: "assistant", text: INITIAL_GREETING },
  ]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [sending, setSending] = useState(false);

  // Persist current session id
  useEffect(() => {
    localStorage.setItem(SESSION_KEY, sessionIdRef.current);
  }, []);

  // Lazy-load history once when chat becomes visible
  const loadHistory = useCallback(async () => {
    if (!enabled || historyLoaded) return;
    try {
      const { data } = await api.get(`/ai/history/${sessionIdRef.current}`);
      if (Array.isArray(data) && data.length) {
        setMessages(
          data.map((d, i) => ({
            id: `hist_${i}_${d.created_at || Date.now()}`,
            role: d.role,
            text: d.text,
            image: d.has_image,
          })),
        );
      }
    } catch (err) {
      console.warn("chat history load failed:", err?.message || err);
    }
    setHistoryLoaded(true);
  }, [enabled, historyLoaded]);

  const send = useCallback(
    async ({ text, imageBase64 }) => {
      if (!text && !imageBase64) return;
      const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setMessages((m) => [...m, { id: userId, role: "user", text: text || "(image)", image: imageBase64 }]);
      setSending(true);
      try {
        const { data } = await api.post("/ai/chat", {
          message: text || "Please analyze this screenshot and suggest annotations.",
          session_id: sessionIdRef.current,
          image_base64: imageBase64,
          image_mime: "image/png",
        });
        setMessages((m) => [
          ...m,
          { id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role: "assistant", text: data.reply },
        ]);
      } catch (e) {
        console.warn("ai chat send failed:", e?.message || e);
        setMessages((m) => [
          ...m,
          { id: `err_${Date.now()}`, role: "assistant", text: "Sorry, I had trouble responding. Try again?" },
        ]);
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    sessionIdRef.current = `chat_${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(SESSION_KEY, sessionIdRef.current);
    setMessages([{ id: "init_new", role: "assistant", text: "Fresh start — what do you want to capture today?" }]);
    setHistoryLoaded(true);
  }, []);

  return { sessionId: sessionIdRef.current, messages, sending, loadHistory, send, reset };
}
