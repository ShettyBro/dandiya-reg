import { Navigate, Outlet } from "react-router-dom";
import { ChartBar, CreditCard, GearSix, Terminal, UsersThree } from "@phosphor-icons/react";
import { StaffShell, type StaffNavItem } from "../../components/staff/StaffShell.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

const NAV_ITEMS: StaffNavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: ChartBar },
  { to: "/admin/volunteers", label: "Volunteers", icon: UsersThree },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/logs", label: "Logs", icon: Terminal },
  { to: "/admin/settings", label: "Settings", icon: GearSix }
];

export function AdminLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 text-white/50">
        Loading...
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return <Navigate to="/ad-login" replace />;
  }

  return (
    <StaffShell
      navItems={NAV_ITEMS}
      brandLabel="Dandiya Night 2026"
      roleLabel="Admin Panel"
      userLabel={user.email}
      onLogout={logout}
    >
      <Outlet context={{ user }} />
    </StaffShell>
  );
}
