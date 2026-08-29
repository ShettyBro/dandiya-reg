import { useCallback, useEffect, useState } from "react";
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

export function useAuth() {
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

  async function login(email: string, password: string) {
    await apiRequest("/auth/login", { method: "POST", body: { email, password } });
    await refetch();
  }

  async function logout() {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
  }

  return { user, loading, login, logout, refetch };
}
