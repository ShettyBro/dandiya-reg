import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BottomNav } from "../../components/volunteer/BottomNav.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

export function VolunteerLayout() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 text-white/50">
        Loading...
      </div>
    );
  }

  if (!user || (user.role !== "VOLUNTEER" && user.role !== "TEAM_LEADER")) {
    return <Navigate to="/vol/login" replace />;
  }

  if (user.mustChangePassword && location.pathname !== "/vol/change-password") {
    return <Navigate to="/vol/change-password" replace />;
  }

  return (
    <div className="min-h-[100dvh] bg-midnight-950 pb-20">
      <Outlet context={{ user }} />
      <BottomNav />
    </div>
  );
}
