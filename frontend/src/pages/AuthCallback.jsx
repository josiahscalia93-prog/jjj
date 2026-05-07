import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

export default function AuthCallback() {
  const nav = useNavigate();
  const { setSession } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) { nav("/login"); return; }
    const session_id = decodeURIComponent(m[1]);

    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id });
        setToken(data.token);
        setSession?.(data.token, data.user);
        toast.success(`Welcome, ${data.user.name?.split(" ")[0] || ""}!`);
        // clear hash
        window.history.replaceState({}, "", "/dashboard");
        nav("/dashboard", { replace: true, state: { user: data.user } });
      } catch (e) {
        toast.error("Sign-in failed");
        nav("/login", { replace: true });
      }
    })();
  }, [nav, setSession]);

  return (
    <div className="min-h-screen grid place-items-center bg-[#FAFAFA]">
      <div className="nb bg-white p-8 text-center">
        <div className="label-mono mb-2">Connecting Google account</div>
        <div className="font-display text-2xl font-bold">Just a sec…</div>
      </div>
    </div>
  );
}
