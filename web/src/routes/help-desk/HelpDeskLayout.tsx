import { Navigate, Outlet } from "react-router-dom";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { StaffShell, type StaffNavItem } from "../../components/staff/StaffShell.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

const NAV_ITEMS: StaffNavItem[] = [{ to: "/help/search", label: "Search", icon: MagnifyingGlass }];

export function HelpDeskLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 text-white/50">
        Loading...
      </div>
    );
  }

  if (!user || (user.role !== "HELP_DESK" && user.role !== "ADMIN")) {
    return <Navigate to="/help" replace />;
  }

  return (
    <StaffShell
      navItems={NAV_ITEMS}
      brandLabel="Dandiya Night 2026"
      roleLabel="Help Desk"
      userLabel={user.email}
      onLogout={logout}
    >
      <Outlet context={{ user }} />
    </StaffShell>
  );
}
