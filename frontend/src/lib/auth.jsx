import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, getToken } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Skip /me check if returning from Google OAuth (let AuthCallback handle it)
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (err) {
      // 401 here is expected when not logged in — keep user=null silently.
      if (err?.response?.status && err.response.status !== 401) {
        console.warn("auth refresh failed:", err.response.status, err.message);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  const register = async (email, password, name) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // Logout is fail-soft (server side may have already cleared session).
      console.warn("logout call failed (continuing client-side cleanup):", err?.message || err);
    }
    setToken(null);
    setUser(null);
  };
  const setSession = (token, u) => { setToken(token); setUser(u); };

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout, refresh, setSession }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
