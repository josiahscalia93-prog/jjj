import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { ArrowRight } from "lucide-react";

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.1 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.6 29 5 24 5 13.5 5 5 13.5 5 24s8.5 19 19 19 19-8.5 19-19c0-1.2-.1-2.5-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.3 1 7.3 2.7l5.7-5.7C33.6 6.6 29 5 24 5 16.3 5 9.7 9 6.3 14.7z"/><path fill="#4CAF50" d="M24 43c5 0 9.5-1.6 13-4.4l-6-5C29 35 26.6 36 24 36c-5.3 0-9.7-2.9-11.3-7l-6.6 5.1C9.4 39 16.1 43 24 43z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.7-3.7 5l6 5C40.7 35.6 43 30.2 43 24c0-1.2-.1-2.5-.4-3.5z"/></svg>
);

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, pw);
      toast.success("Welcome back");
      nav("/dashboard");
    } catch { toast.error("Wrong email or password"); }
    finally { setBusy(false); }
  };

  const googleSignIn = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div>
      <Navbar />
      <div className="min-h-[calc(100vh-64px)] grid place-items-center px-5 py-12 bg-[#FAFAFA]">
        <div className="w-full max-w-md nb-lg bg-white p-8 fade-up" data-testid="login-card">
          <div className="label-mono mb-2">Welcome back</div>
          <h1 className="font-display text-4xl font-black mb-1">Sign in</h1>
          <p className="text-sm text-zinc-600 mb-6">to your SnapBurst account</p>

          <button onClick={googleSignIn} className="nb-btn bg-white w-full mb-3" data-testid="google-signin-btn">
            <GoogleIcon /> Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4 text-xs text-zinc-500">
            <div className="h-px flex-1 bg-zinc-300" /> OR <div className="h-px flex-1 bg-zinc-300" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label-mono">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="nb-input mt-1" data-testid="login-email" />
            </div>
            <div>
              <label className="label-mono">Password</label>
              <input type="password" required value={pw} onChange={e => setPw(e.target.value)} className="nb-input mt-1" data-testid="login-password" />
            </div>
            <button disabled={busy} className="nb-btn nb-btn-yellow w-full mt-2" data-testid="login-submit">
              {busy ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
            </button>
          </form>

          <p className="text-sm text-center mt-6">No account? <Link to="/register" className="font-bold underline" data-testid="link-register">Create one</Link></p>
          {loc.search?.includes("from=extension") && (
            <p className="mt-4 text-xs text-center text-zinc-500">Sign in to connect the SnapBurst Chrome extension.</p>
          )}
        </div>
      </div>
    </div>
  );
}
