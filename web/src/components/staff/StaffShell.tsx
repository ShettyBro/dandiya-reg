import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { List, SignOut, X } from "@phosphor-icons/react";
import { cn } from "../../lib/cn.js";

export interface StaffNavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; weight?: "regular" | "fill"; className?: string }>;
}

export function StaffShell({
  navItems,
  brandLabel,
  roleLabel,
  userLabel,
  onLogout,
  children
}: {
  navItems: StaffNavItem[];
  brandLabel: string;
  roleLabel: string;
  userLabel: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = navItems.find((item) => item.to === location.pathname);

  return (
    <div className="flex min-h-[100dvh] bg-midnight-950">
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-white/10 bg-midnight-900 transition-transform duration-200 lg:static lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="font-display text-sm font-semibold text-white">{brandLabel}</p>
            <p className="text-xs font-semibold text-festival-gold">{roleLabel}</p>
          </div>
          <button
            type="button"
            className="text-white/60 lg:hidden"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="border-b border-white/10 px-5 py-3 text-xs text-white/50">
          Signed in as <span className="text-white/85">{userLabel}</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex items-center gap-3 border-r-2 px-5 py-3 text-sm transition-colors",
                  isActive
                    ? "border-festival-gold bg-festival-gold/10 text-festival-gold"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={18} weight={isActive ? "fill" : "regular"} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-pill border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-300"
          >
            <SignOut size={16} /> Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-[100dvh] flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-midnight-950/95 px-4 py-3 lg:px-8">
          <button
            type="button"
            className="text-white lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <List size={22} />
          </button>
          <h1 className="font-display text-base font-semibold text-white">{current?.label ?? brandLabel}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
