import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest, ApiError } from "../api.js";

export interface VolunteerProfile {
  name: string;
  phone: string;
  gate: string | null;
  zone: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
}

export interface AuthUser {
  userId: string;
  role: "ADMIN" | "FINANCE" | "VOLUNTEER" | "TEAM_LEADER";
  email: string;
  mustChangePassword: boolean;
  profile: VolunteerProfile | null;
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

  const login = useCallback(
    async (email: string, password: string) => {
      await apiRequest("/auth/login", { method: "POST", body: { email, password } });
      await refetch();
    },
    [refetch]
  );

  const logout = useCallback(async () => {
    await apiRequest("/auth/logout", { method: "POST" });
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
