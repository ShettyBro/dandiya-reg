import { useEffect, useState, type FormEvent } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

interface EventSettings {
  name: string;
  venue: string;
  eventDate: string;
  registrationOpen: boolean;
  nonAcharyanRegistrationOpen: boolean;
  registrationDeadline: string | null;
  capacity: number;
  priceInPaise: number;
  erpPaymentUrl: string;
  paymentInstructions: string;
  attendanceEnabled: boolean;
  paymentsEnabled: boolean;
  maintenanceMode: boolean;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function Toggle({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left disabled:opacity-50"
    >
      <span className="text-sm text-white/85">{label}</span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-emerald-400/80" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<EventSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [deadlineSaved, setDeadlineSaved] = useState(false);
  const [pendingToggleField, setPendingToggleField] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<{ field: string; message: string } | null>(null);

  useEffect(() => {
    apiRequest<EventSettings>("/admin/settings")
      .then(setSettings)
      .catch((error) =>
        setError(
          error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE
            ? error.message
            : "Could not load settings."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiRequest<EventSettings>("/admin/settings", {
        method: "POST",
        body: {
          name: settings.name,
          venue: settings.venue,
          eventDate: settings.eventDate,
          registrationOpen: settings.registrationOpen,
          nonAcharyanRegistrationOpen: settings.nonAcharyanRegistrationOpen,
          registrationDeadline: settings.registrationDeadline,
          capacity: settings.capacity,
          priceInPaise: settings.priceInPaise,
          erpPaymentUrl: settings.erpPaymentUrl,
          paymentInstructions: settings.paymentInstructions,
          attendanceEnabled: settings.attendanceEnabled,
          paymentsEnabled: settings.paymentsEnabled,
          maintenanceMode: settings.maintenanceMode
        }
      });
      setSettings(updated);
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof ApiError && saveError.code === SERVER_UNREACHABLE_CODE
          ? saveError.message
          : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  // Toggles apply instantly on click rather than waiting for the big "Save settings" button at
  // the bottom of the page — a switch that silently doesn't take effect until a separate,
  // easy-to-miss save action is confusing and dangerous for something as operationally important
  // as closing registration. Optimistically flips the switch, then rolls it back if the save fails.
  async function updateToggleField(
    key: "registrationOpen" | "nonAcharyanRegistrationOpen" | "attendanceEnabled" | "paymentsEnabled" | "maintenanceMode",
    value: boolean
  ) {
    if (!settings) return;
    const previous = settings[key];
    setToggleError(null);
    setPendingToggleField(key);
    setSettings({ ...settings, [key]: value });
    try {
      const updated = await apiRequest<EventSettings>("/admin/settings", {
        method: "POST",
        body: { [key]: value }
      });
      setSettings(updated);
    } catch (saveError) {
      setSettings((current) => (current ? { ...current, [key]: previous } : current));
      setToggleError({
        field: key,
        message:
          saveError instanceof ApiError && saveError.code === SERVER_UNREACHABLE_CODE
            ? saveError.message
            : "Could not save — change reverted."
      });
    } finally {
      setPendingToggleField(null);
    }
  }

  async function handleSaveDeadline() {
    if (!settings) return;
    setSavingDeadline(true);
    setDeadlineError(null);
    setDeadlineSaved(false);
    try {
      const updated = await apiRequest<EventSettings>("/admin/settings", {
        method: "POST",
        body: { registrationDeadline: settings.registrationDeadline }
      });
      setSettings(updated);
      setDeadlineSaved(true);
    } catch (saveError) {
      setDeadlineError(
        saveError instanceof ApiError && saveError.code === SERVER_UNREACHABLE_CODE
          ? saveError.message
          : "Could not save the deadline."
      );
    } finally {
      setSavingDeadline(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-white/50">Loading settings...</p>;
  }

  if (!settings) {
    return <p className="text-sm text-red-300">{error ?? "Settings unavailable."}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-5">
      <GlassPanel className="p-5">
        <Toggle
          label={settings.registrationOpen ? "Registration is OPEN" : "Registration is CLOSED"}
          checked={settings.registrationOpen}
          disabled={pendingToggleField === "registrationOpen"}
          onChange={(value) => updateToggleField("registrationOpen", value)}
        />
        {toggleError?.field === "registrationOpen" && (
          <p className="mt-2 text-xs text-red-300">{toggleError.message}</p>
        )}
      </GlassPanel>

      <GlassPanel className="p-5">
        <Toggle
          label={
            settings.nonAcharyanRegistrationOpen
              ? "Non-Acharyan student registration is OPEN"
              : "Non-Acharyan student registration is CLOSED"
          }
          checked={settings.nonAcharyanRegistrationOpen}
          disabled={pendingToggleField === "nonAcharyanRegistrationOpen"}
          onChange={(value) => updateToggleField("nonAcharyanRegistrationOpen", value)}
        />
        <p className="mt-2 text-xs text-white/40">
          Acharya Student, Acharya Faculty, and Acharya Alumni registration are controlled separately by the
          main registration toggle above and are unaffected by this.
        </p>
        {toggleError?.field === "nonAcharyanRegistrationOpen" && (
          <p className="mt-2 text-xs text-red-300">{toggleError.message}</p>
        )}
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-3 p-5">
        <div>
          <label className="text-sm font-medium text-white/85">Registration deadline</label>
          <p className="mt-1 text-xs text-white/45">
            Once this date/time passes, registration automatically closes everywhere on the site — the
            "Join the Celebration" buttons grey out and switch to "Registration Closed", no manual toggle
            needed. Leave empty for no fixed deadline. You can move this later to extend registration.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FormField
              label="Closes at"
              type="datetime-local"
              value={toDatetimeLocal(settings.registrationDeadline)}
              onChange={(e) => {
                setDeadlineSaved(false);
                setSettings({
                  ...settings,
                  registrationDeadline: e.target.value ? new Date(e.target.value).toISOString() : null
                });
              }}
            />
          </div>
          {settings.registrationDeadline && (
            <button
              type="button"
              onClick={() => {
                setDeadlineSaved(false);
                setSettings({ ...settings, registrationDeadline: null });
              }}
              className="mb-0.5 text-xs text-white/40 underline hover:text-white/70"
            >
              Clear deadline
            </button>
          )}
          <Button type="button" onClick={handleSaveDeadline} disabled={savingDeadline} className="px-5 py-2.5 text-sm">
            {savingDeadline ? "Saving..." : "Save deadline"}
          </Button>
        </div>
        {deadlineError && <p className="text-xs text-red-300">{deadlineError}</p>}
        {deadlineSaved && !deadlineError && <p className="text-xs text-emerald-300">Deadline saved.</p>}
        {settings.registrationDeadline &&
          (() => {
            const msLeft = new Date(settings.registrationDeadline).getTime() - Date.now();
            const passed = msLeft <= 0;
            const daysLeft = Math.max(1, Math.ceil(msLeft / MS_PER_DAY));
            return (
              <p className={`text-xs font-medium ${passed ? "text-red-300" : "text-emerald-300"}`}>
                {passed
                  ? "This deadline has passed — registration currently shows as closed on the public site."
                  : `Currently shows "${daysLeft} day${daysLeft === 1 ? "" : "s"} left" on the public site.`}
              </p>
            );
          })()}
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-4 p-5">
        <FormField
          label="Event name"
          value={settings.name}
          onChange={(e) => setSettings({ ...settings, name: e.target.value })}
        />
        <FormField
          label="Venue"
          value={settings.venue}
          onChange={(e) => setSettings({ ...settings, venue: e.target.value })}
        />
        <FormField
          label="Event date"
          type="datetime-local"
          value={toDatetimeLocal(settings.eventDate)}
          onChange={(e) => setSettings({ ...settings, eventDate: new Date(e.target.value).toISOString() })}
        />
        <FormField
          label="Capacity (planning estimate only — not enforced, registration is unlimited)"
          type="number"
          value={String(settings.capacity)}
          onChange={(e) => setSettings({ ...settings, capacity: Number(e.target.value) })}
        />
        <FormField
          label="Price (in paise)"
          type="number"
          value={String(settings.priceInPaise)}
          onChange={(e) => setSettings({ ...settings, priceInPaise: Number(e.target.value) })}
        />
        <FormField
          label="ERP payment URL"
          value={settings.erpPaymentUrl}
          onChange={(e) => setSettings({ ...settings, erpPaymentUrl: e.target.value })}
        />
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-white/85">Payment instructions</label>
          <textarea
            rows={3}
            value={settings.paymentInstructions}
            onChange={(e) => setSettings({ ...settings, paymentInstructions: e.target.value })}
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
          />
        </div>
      </GlassPanel>

      <GlassPanel className="flex flex-col gap-3 p-5">
        <Toggle
          label="Attendance scanning enabled"
          checked={settings.attendanceEnabled}
          disabled={pendingToggleField === "attendanceEnabled"}
          onChange={(value) => updateToggleField("attendanceEnabled", value)}
        />
        <Toggle
          label="Payment submissions enabled"
          checked={settings.paymentsEnabled}
          disabled={pendingToggleField === "paymentsEnabled"}
          onChange={(value) => updateToggleField("paymentsEnabled", value)}
        />
        <Toggle
          label="Maintenance mode"
          checked={settings.maintenanceMode}
          disabled={pendingToggleField === "maintenanceMode"}
          onChange={(value) => updateToggleField("maintenanceMode", value)}
        />
        {(toggleError?.field === "attendanceEnabled" ||
          toggleError?.field === "paymentsEnabled" ||
          toggleError?.field === "maintenanceMode") && (
          <p className="text-xs text-red-300">{toggleError.message}</p>
        )}
      </GlassPanel>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-emerald-300">Settings saved.</p>}

      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
