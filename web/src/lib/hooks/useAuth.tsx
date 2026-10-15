import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, ApiError } from "../api.js";
import { clearTokens, getRefreshToken, setTokens } from "../auth-tokens.js";

export type AssignedGate = "COLLEGE_GATE" | "EVENT_GATE";

export interface VolunteerProfile {
  name: string;
  phone: string;
  gate: string | null;
  zone: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  assignedGate: AssignedGate | null;
}

export interface AuthUser {
  userId: string;
  role: "ADMIN" | "FINANCE" | "VOLUNTEER" | "TEAM_LEADER" | "ID_VERIFIER" | "HELP_DESK";
  email: string;
  mustChangePassword: boolean;
  profile: VolunteerProfile | null;
}

interface LoginResponse {
  role: string;
  email: string;
  mustChangePassword: boolean;
  accessToken: string;
  refreshToken: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      // No access token yet on a fresh page load (it only lives in memory) -- apiRequest's own
      // 401-triggers-refresh handling transparently mints one from the stored refresh token
      // before this call ever reaches the server, as long as one exists.
      if (!getRefreshToken()) {
        setUser(null);
        return;
      }
      const me = await apiRequest<AuthUser>("/auth/me");
      setUser(me);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { email, password } });
    setTokens(result.accessToken, result.refreshToken);
    await refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await apiRequest("/auth/logout", { method: "POST", body: refreshToken ? { refreshToken } : undefined });
    } catch {
      // Still clear local state even if the server call fails (offline, already-expired session,
      // etc.) -- the user asked to log out, and there's nothing else useful to do with the error.
    }
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refetch }), [user, loading, login, logout, refetch]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
