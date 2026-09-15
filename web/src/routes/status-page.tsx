import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { FormField } from "../components/ui/FormField.js";
import { Button } from "../components/ui/Button.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../lib/api.js";

interface StatusResponse {
  publicCode: string;
  name: string;
  status: string;
  paymentStatus: string | null;
  rejectionReason: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  PAYMENT_PENDING: "Awaiting payment",
  IDENTITY_PENDING: "Identity verification pending",
  IDENTITY_REJECTED: "Identity verification issue",
  PAYMENT_SUBMITTED: "Verification pending",
  PAYMENT_APPROVED: "Approved",
  PAYMENT_REJECTED: "Payment rejected"
};

const REJECTED_STATUSES = new Set(["PAYMENT_REJECTED", "IDENTITY_REJECTED"]);

type LookupMode = "code" | "phone";

export function StatusPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<LookupMode>("code");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleModeSwitch(next: LookupMode) {
    setMode(next);
    setResult(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (mode === "code") {
        const response = await apiRequest<StatusResponse>(
          `/registrations/status/${encodeURIComponent(code.trim())}`
        );
        setResult(response);
      } else {
        const response = await apiRequest<StatusResponse>(
          "/registrations/status/by-phone",
          { method: "POST", body: { phone: phone.trim() } }
        );
        setResult(response);
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.code === SERVER_UNREACHABLE_CODE) {
        setError(fetchError.message);
      } else if (fetchError instanceof ApiError && fetchError.status === 404) {
        setError(
          mode === "phone"
            ? "No registration found for that phone number."
            : "No registration found for that code."
        );
      } else if (fetchError instanceof ApiError && fetchError.status === 400) {
        setError(fetchError.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-md">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Check registration status
          </h1>
          <p className="mb-8 text-sm text-white/60">
            Look up your registration using your code or registered phone number.
          </p>

          {/* Tab toggle */}
          <div className="mb-5 flex gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {(["code", "phone"] as LookupMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-festival-gold text-midnight-950 shadow"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {m === "code" ? "Registration Code" : "Phone Number"}
              </button>
            ))}
          </div>

          <GlassPanel className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {mode === "code" ? (
                <FormField
                  label="Registration code"
                  placeholder="e.g. A1B2C3D4"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              ) : (
                <FormField
                  label="Registered phone number"
                  placeholder="e.g. 9876543210"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Checking..." : "Check status"}
              </Button>
            </form>

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            {result && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <p className="text-sm text-white/60">{result.name}</p>
                <p className="mt-0.5 font-mono text-xs text-white/35 tracking-widest">{result.publicCode}</p>
                <p className="mt-2 font-display text-lg font-semibold text-white">
                  {STATUS_LABELS[result.status] ?? result.status}
                </p>
                {result.status === "PAYMENT_APPROVED" && (
                  <p className="mt-3 rounded-xl border border-festival-gold/25 bg-festival-gold/8 px-4 py-3 text-sm text-festival-gold">
                    Your Dandiya Celebration Kit will be provided at the event venue.
                  </p>
                )}
                {REJECTED_STATUSES.has(result.status) && result.rejectionReason && (
                  <>
                    <p className="mt-2 text-sm text-red-300">Reason: {result.rejectionReason}</p>
                    <p className="mt-2 text-xs text-white/50">
                      You can register again using your existing payment proof if it wasn't the issue — do
                      not make another payment unless asked to.
                    </p>
                  </>
                )}
              </div>
            )}
          </GlassPanel>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}

