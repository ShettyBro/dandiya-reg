import { NavLink } from "react-router-dom";
import { House, QrCode } from "@phosphor-icons/react";
import { cn } from "../../lib/cn.js";

const TABS = [
  { to: "/vol/home", label: "Home", icon: House },
  { to: "/vol/scan", label: "Scan", icon: QrCode }
];

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-midnight-950/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 px-6 py-2 text-xs",
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
