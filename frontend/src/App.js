import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import CaptureDetail from "./pages/CaptureDetail";
import SharePage from "./pages/SharePage";
import AuthCallback from "./pages/AuthCallback";
import Settings from "./pages/Settings";
import Privacy from "./pages/Privacy";
import StorePreview from "./pages/StorePreview";
import AdminAnalytics from "./pages/AdminAnalytics";
import GetExtension from "./pages/GetExtension";
import SubmitChecklist from "./pages/SubmitChecklist";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#FAFAFA]"><div className="label-mono">Loading…</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Routed() {
  const loc = useLocation();
  // CRITICAL synchronous handling of OAuth redirect (#session_id=...)
  if (loc.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/capture/:id" element={<Protected><CaptureDetail /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/store-preview" element={<StorePreview />} />
      <Route path="/get-extension" element={<GetExtension />} />
      <Route path="/download" element={<GetExtension />} />
      <Route path="/submit-checklist" element={<Protected><SubmitChecklist /></Protected>} />
      <Route path="/admin/analytics" element={<Protected><AdminAnalytics /></Protected>} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routed />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
