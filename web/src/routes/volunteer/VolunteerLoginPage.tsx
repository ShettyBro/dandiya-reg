import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { BambooGallery } from "../../components/gallery/BambooGallery.js";
import { FormField } from "../../components/ui/FormField.js";
import { Button } from "../../components/ui/Button.js";
import { useAuth } from "../../lib/hooks/useAuth.js";
import { useInstallPrompt } from "../../lib/hooks/useInstallPrompt.js";
import { ApiError } from "../../lib/api.js";

export function VolunteerLoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/vol/home", { replace: true });
    } catch (error) {
      setError(error instanceof ApiError ? error.message : "Invalid email or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center px-5">
      <BambooGallery />
      <GlassPanel className="relative z-10 w-full max-w-sm p-6 sm:p-8">
        <div className="mb-2 flex items-center gap-2.5">
          <img src="/acharya-mark.png" alt="Dandiya Night 2026" className="h-9 w-auto" />
          <span className="font-display text-lg font-semibold text-white">
            Dandiya Night <span className="text-festival-gold">2026</span>
          </span>
        </div>
        <h1 className="font-display text-xl font-semibold text-white">Volunteer sign in</h1>
        <p className="mt-1 text-sm text-white/60">Scanner portal</p>

        {canInstall && !installed && (
          <button
            type="button"
            onClick={promptInstall}
            className="mt-4 w-full rounded-xl border border-festival-gold/40 bg-festival-gold/10 px-4 py-2 text-sm font-medium text-festival-gold"
          >
            Install app on this device
          </button>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <FormField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <FormField
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </GlassPanel>
    </div>
  );
}
