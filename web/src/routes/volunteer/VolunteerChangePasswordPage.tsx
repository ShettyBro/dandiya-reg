import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { FormField } from "../../components/ui/FormField.js";
import { Button } from "../../components/ui/Button.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { useAuth } from "../../lib/hooks/useAuth.js";

export function VolunteerChangePasswordPage() {
  const { refetch, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest("/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword }
      });
      await refetch();
      navigate("/vol/home", { replace: true });
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 401) {
        setError("Current password is incorrect.");
      } else {
        setError("Could not change password. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-midnight-950 px-5">
      <GlassPanel className="w-full max-w-sm p-6 sm:p-8">
        <h1 className="font-display text-xl font-semibold text-white">Set a new password</h1>
        <p className="mt-1 text-sm text-white/60">
          Your account was created with a temporary password. Set your own before continuing.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
          <FormField
            label="Temporary / current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <FormField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save and continue"}
          </Button>
          <button
            type="button"
            onClick={() => logout().then(() => navigate("/vol/login", { replace: true }))}
            className="text-xs text-white/40 underline"
          >
            Sign out instead
          </button>
        </form>
      </GlassPanel>
    </div>
  );
}
