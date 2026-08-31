import { Navigate, Outlet } from "react-router-dom";
import { ChartBar, CreditCard } from "@phosphor-icons/react";
import { StaffShell, type StaffNavItem } from "../../components/staff/StaffShell.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

const NAV_ITEMS: StaffNavItem[] = [
  { to: "/finance/dashboard", label: "Dashboard", icon: ChartBar },
  { to: "/finance/payments", label: "Payments", icon: CreditCard }
];

export function FinanceLayout() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 text-white/50">
        Loading...
      </div>
    );
  }

  if (!user || user.role !== "FINANCE") {
    return <Navigate to="/fin-login" replace />;
  }

  return (
    <StaffShell
      navItems={NAV_ITEMS}
      brandLabel="Dandiya Night 2026"
      roleLabel="Finance Panel"
      userLabel={user.email}
      onLogout={logout}
    >
      <Outlet context={{ user }} />
    </StaffShell>
  );
}
