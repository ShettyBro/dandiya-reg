import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { BambooGallery } from "../../components/gallery/BambooGallery.js";
import { FormField } from "../../components/ui/FormField.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

export function StaffLoginPage({
  title,
  subtitle,
  allowedRoles,
  redirectTo
}: {
  title: string;
  subtitle: string;
  allowedRoles: Array<"ADMIN" | "FINANCE">;
  redirectTo: string;
}) {
  const { login, logout } = useAuth();
  const navigate = useNavigate();
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
      const me = await apiRequest<{ role: string }>("/auth/me");
      if (!allowedRoles.includes(me.role as "ADMIN" | "FINANCE")) {
        await logout();
        setError("This account does not have access to this panel.");
        return;
      }
      navigate(redirectTo, { replace: true });
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
        <h1 className="font-display text-xl font-semibold text-white">{title}</h1>
        <p className="mt-1 text-sm text-white/60">{subtitle}</p>

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
