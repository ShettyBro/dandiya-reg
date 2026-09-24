import { useEffect, useState, type FormEvent } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../../lib/api.js";

interface EventSettings {
  name: string;
  venue: string;
  eventDate: string;
  registrationOpen: boolean;
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
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-left"
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
          onChange={(value) => setSettings({ ...settings, registrationOpen: value })}
        />
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
          label="Registration deadline"
          type="datetime-local"
          value={toDatetimeLocal(settings.registrationDeadline)}
          onChange={(e) =>
            setSettings({
              ...settings,
              registrationDeadline: e.target.value ? new Date(e.target.value).toISOString() : null
            })
          }
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
          onChange={(value) => setSettings({ ...settings, attendanceEnabled: value })}
        />
        <Toggle
          label="Payment submissions enabled"
          checked={settings.paymentsEnabled}
          onChange={(value) => setSettings({ ...settings, paymentsEnabled: value })}
        />
        <Toggle
          label="Maintenance mode"
          checked={settings.maintenanceMode}
          onChange={(value) => setSettings({ ...settings, maintenanceMode: value })}
        />
      </GlassPanel>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-emerald-300">Settings saved.</p>}

      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
