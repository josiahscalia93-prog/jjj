import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Camera, LogOut, LayoutDashboard } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <header className="sticky top-0 z-40 glass-bar border-b-2 border-[#0F0F0F]" data-testid="site-navbar">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group" data-testid="logo-link">
          <div className="w-9 h-9 rounded-lg bg-[#FDE047] border-2 border-[#0F0F0F] grid place-items-center shadow-[2px_2px_0_#0F0F0F] group-hover:rotate-[-6deg] transition-transform">
            <Camera size={18} strokeWidth={2.6} />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">SnapBurst</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <a href="/#features" className="hover:underline underline-offset-4" data-testid="nav-features">Features</a>
          <a href="/#integrations" className="hover:underline underline-offset-4" data-testid="nav-integrations">Integrations</a>
          <a href="/#pricing" className="hover:underline underline-offset-4" data-testid="nav-pricing">Pricing</a>
          <a href="/#faq" className="hover:underline underline-offset-4" data-testid="nav-faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <NavLink to="/dashboard" className="nb-btn nb-btn-mint text-sm py-2 px-3" data-testid="nav-dashboard">
                <LayoutDashboard size={16} /> Dashboard
              </NavLink>
              <NavLink to="/settings" className="text-sm font-semibold hover:underline" data-testid="nav-settings">Settings</NavLink>
              <button onClick={async () => { await logout(); nav("/"); }} className="nb-btn text-sm py-2 px-3" data-testid="nav-logout">
                <LogOut size={16} /> Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold hover:underline" data-testid="nav-login">Sign in</Link>
              <Link to="/register" className="nb-btn nb-btn-yellow text-sm py-2 px-4" data-testid="nav-signup">Get the extension</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
