import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthStatus } from "./api";

interface AuthContextValue {
  status: AuthStatus | null;
  authed: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await api<AuthStatus>("GET", "/auth/status"));
  }, []);

  const logout = useCallback(async () => {
    await api("POST", "/auth/logout");
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh().catch(() => setStatus({ setupRequired: false, stage: null }));
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ status, authed: status?.stage === "full", refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
