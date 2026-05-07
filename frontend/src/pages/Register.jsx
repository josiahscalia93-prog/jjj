import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import Navbar from "../components/Navbar";
import { ArrowRight } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(email, pw, name);
      toast.success("Welcome to SnapBurst 🎉");
      nav("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally { setBusy(false); }
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
        <div className="w-full max-w-md nb-lg bg-white p-8 fade-up" data-testid="register-card">
          <div className="label-mono mb-2">Get started — it's free</div>
          <h1 className="font-display text-4xl font-black mb-1">Create your account</h1>
          <p className="text-sm text-zinc-600 mb-6">No credit card. No watermark. Forever.</p>

          <button onClick={googleSignIn} className="nb-btn bg-white w-full mb-3" data-testid="google-signin-btn">
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-4 text-xs text-zinc-500">
            <div className="h-px flex-1 bg-zinc-300" /> OR <div className="h-px flex-1 bg-zinc-300" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="label-mono">Name</label>
              <input required value={name} onChange={e => setName(e.target.value)} className="nb-input mt-1" data-testid="register-name" />
            </div>
            <div>
              <label className="label-mono">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="nb-input mt-1" data-testid="register-email" />
            </div>
            <div>
              <label className="label-mono">Password</label>
              <input type="password" required minLength={6} value={pw} onChange={e => setPw(e.target.value)} className="nb-input mt-1" data-testid="register-password" />
            </div>
            <button disabled={busy} className="nb-btn nb-btn-tangerine w-full mt-2" data-testid="register-submit">
              {busy ? "Creating…" : "Create account"} <ArrowRight size={16} />
            </button>
          </form>

          <p className="text-sm text-center mt-6">Already have one? <Link to="/login" className="font-bold underline" data-testid="link-login">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
