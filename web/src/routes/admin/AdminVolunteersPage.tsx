import { useEffect, useState, type FormEvent } from "react";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { Button } from "../../components/ui/Button.js";
import { FormField } from "../../components/ui/FormField.js";
import { CustomSelect } from "../../components/ui/CustomSelect.js";
import { apiRequest, ApiError } from "../../lib/api.js";

interface VolunteerProfile {
  name: string;
  phone: string;
  gate: string | null;
  zone: string | null;
  mustChangePassword: boolean;
}

interface VolunteerUser {
  id: string;
  email: string;
  role: "VOLUNTEER" | "TEAM_LEADER";
  status: "ACTIVE" | "DISABLED";
  volunteerProfile: VolunteerProfile | null;
}

interface CreatedCredential {
  email: string;
  temporaryPassword: string;
}

export function AdminVolunteersPage() {
  const [volunteers, setVolunteers] = useState<VolunteerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [credential, setCredential] = useState<CreatedCredential | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"VOLUNTEER" | "TEAM_LEADER">("VOLUNTEER");
  const [gate, setGate] = useState("");
  const [zone, setZone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function fetchVolunteers() {
    setLoading(true);
    setError(null);
    apiRequest<{ items: VolunteerUser[] }>("/admin/volunteers")
      .then((data) => setVolunteers(data.items))
      .catch(() => setError("Could not load volunteers."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchVolunteers();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await apiRequest<{ userId: string; email: string; temporaryPassword: string }>(
        "/admin/volunteers",
        {
          method: "POST",
          body: {
            name,
            email,
            phone,
            role,
            ...(gate.trim() ? { gate: gate.trim() } : {}),
            ...(zone.trim() ? { zone: zone.trim() } : {})
          }
        }
      );
      setCredential({ email: created.email, temporaryPassword: created.temporaryPassword });
      setName("");
      setEmail("");
      setPhone("");
      setGate("");
      setZone("");
      setRole("VOLUNTEER");
      setShowForm(false);
      fetchVolunteers();
    } catch (createError) {
      if (createError instanceof ApiError && createError.code === "EMAIL_ALREADY_EXISTS") {
        setFormError("A user with this email already exists.");
      } else {
        setFormError("Could not create volunteer.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(volunteer: VolunteerUser) {
    setBusyId(volunteer.id);
    try {
      await apiRequest(`/admin/volunteers/${volunteer.id}`, {
        method: "PATCH",
        body: { status: volunteer.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }
      });
      fetchVolunteers();
    } catch {
      setError("Could not update volunteer status.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(volunteer: VolunteerUser) {
    setBusyId(volunteer.id);
    try {
      const result = await apiRequest<{ email: string; temporaryPassword: string }>(
        `/admin/volunteers/${volunteer.id}/reset-password`,
        { method: "POST" }
      );
      setCredential({ email: result.email, temporaryPassword: result.temporaryPassword });
    } catch {
      setError("Could not reset password.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {credential && (
        <GlassPanel className="flex flex-wrap items-center justify-between gap-3 border-emerald-400/40 p-4">
          <p className="text-sm text-white/85">
            Temporary password for <span className="font-semibold text-emerald-300">{credential.email}</span>:{" "}
            <span className="font-mono text-emerald-300">{credential.temporaryPassword}</span> — share this with
            them now, it will not be shown again.
          </p>
          <button
            type="button"
            onClick={() => setCredential(null)}
            className="text-sm text-white/50 hover:text-white"
          >
            Dismiss
          </button>
        </GlassPanel>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-white">Volunteers</h2>
        <Button type="button" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Add volunteer"}
        </Button>
      </div>

      {showForm && (
        <GlassPanel className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <FormField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <FormField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <CustomSelect
              label="Role"
              value={role}
              onChange={(value) => setRole(value as "VOLUNTEER" | "TEAM_LEADER")}
              options={[
                { value: "VOLUNTEER", label: "Volunteer" },
                { value: "TEAM_LEADER", label: "Team Leader" }
              ]}
            />
            <FormField label="Gate (optional)" value={gate} onChange={(e) => setGate(e.target.value)} />
            <FormField label="Zone (optional)" value={zone} onChange={(e) => setZone(e.target.value)} />
            {formError && <p className="col-span-full text-sm text-red-300">{formError}</p>}
            <div className="col-span-full">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create volunteer"}
              </Button>
            </div>
          </form>
        </GlassPanel>
      )}

      {loading ? (
        <p className="text-sm text-white/50">Loading volunteers...</p>
      ) : volunteers.length === 0 ? (
        <GlassPanel className="p-8 text-center text-sm text-white/50">No volunteers yet.</GlassPanel>
      ) : (
        <div className="flex flex-col gap-3">
          {volunteers.map((volunteer) => (
            <GlassPanel key={volunteer.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-display text-sm font-semibold text-white">
                  {volunteer.volunteerProfile?.name ?? volunteer.email}
                </p>
                <p className="text-xs text-white/50">
                  {volunteer.email} · {volunteer.role === "TEAM_LEADER" ? "Team Leader" : "Volunteer"}
                  {volunteer.volunteerProfile?.gate && ` · Gate ${volunteer.volunteerProfile.gate}`}
                  {volunteer.volunteerProfile?.zone && ` · Zone ${volunteer.volunteerProfile.zone}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-pill border px-3 py-1 text-xs font-semibold ${
                    volunteer.status === "ACTIVE"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-red-400/40 bg-red-400/10 text-red-300"
                  }`}
                >
                  {volunteer.status === "ACTIVE" ? "Active" : "Disabled"}
                </span>
                <button
                  type="button"
                  onClick={() => toggleStatus(volunteer)}
                  disabled={busyId === volunteer.id}
                  className="rounded-pill border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  {volunteer.status === "ACTIVE" ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => resetPassword(volunteer)}
                  disabled={busyId === volunteer.id}
                  className="rounded-pill border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Reset password
                </button>
              </div>
            </GlassPanel>
          ))}
        </div>
      )}
    </div>
  );
}
