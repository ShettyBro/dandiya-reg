import { useOutletContext, useNavigate } from "react-router-dom";
import { SignOut, MapPin, Clock } from "@phosphor-icons/react";
import { Container } from "../../components/ui/Container.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { useAuth, type AuthUser } from "../../lib/hooks/useAuth.js";

function formatShiftTime(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function VolunteerHomePage() {
  const { user } = useOutletContext<{ user: AuthUser }>();
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/volunteer/login", { replace: true });
  }

  const shiftStart = formatShiftTime(user.profile?.shiftStart ?? null);
  const shiftEnd = formatShiftTime(user.profile?.shiftEnd ?? null);

  return (
    <Container className="max-w-md py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-white/50">
            {user.role === "TEAM_LEADER" ? "Team Leader" : "Volunteer"}
          </p>
          <h1 className="font-display text-2xl font-semibold text-white">
            {user.profile?.name ?? user.email}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          aria-label="Sign out"
          className="text-white/50 hover:text-white"
        >
          <SignOut size={22} />
        </button>
      </div>

      <GlassPanel className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3 text-sm text-white/80">
          <MapPin size={18} className="text-festival-gold" />
          {user.profile?.gate || user.profile?.zone
            ? [user.profile?.gate, user.profile?.zone].filter(Boolean).join(" · ")
            : "No gate/zone assigned yet"}
        </div>
        {(shiftStart || shiftEnd) && (
          <div className="flex items-center gap-3 text-sm text-white/80">
            <Clock size={18} className="text-festival-gold" />
            {shiftStart} - {shiftEnd}
          </div>
        )}
      </GlassPanel>

      <p className="mt-6 text-center text-sm text-white/50">
        Head to the Scan tab to start checking in participants.
      </p>
    </Container>
  );
}
