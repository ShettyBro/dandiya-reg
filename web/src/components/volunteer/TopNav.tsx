import { NavLink } from "react-router-dom";
import { House, QrCode } from "@phosphor-icons/react";
import { cn } from "../../lib/cn.js";

const TABS = [
  { to: "/vol/home", label: "Dashboard", icon: House },
  { to: "/vol/scan", label: "Scan", icon: QrCode }
];

// Fixed to the top (not bottom) with safe-area padding so it clears the notch/status bar on iOS
// and the status bar on Android when installed as a standalone PWA.
export function TopNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-midnight-950/95 pt-[env(safe-area-inset-top)] backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-center justify-around py-2.5">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 px-6 py-1.5 text-xs",
                isActive ? "text-festival-gold" : "text-white/50"
              )
            }
          >
            <tab.icon size={24} weight="duotone" />
            {tab.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
