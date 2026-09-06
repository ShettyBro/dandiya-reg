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

export function StatusPage() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiRequest<StatusResponse>(
        `/registrations/status/${encodeURIComponent(code.trim())}`
      );
      setResult(response);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.code === SERVER_UNREACHABLE_CODE) {
        setError(fetchError.message);
      } else if (fetchError instanceof ApiError && fetchError.status === 404) {
        setError("No registration found for that code.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-midnight-950">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-md">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Check registration status
          </h1>
          <p className="mb-8 text-sm text-white/60">Enter your registration code or 8-digit code.</p>

          <GlassPanel className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FormField label="Registration code" value={code} onChange={(e) => setCode(e.target.value)} required />
              <Button type="submit" disabled={loading}>
                {loading ? "Checking..." : "Check status"}
              </Button>
            </form>

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            {result && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <p className="text-sm text-white/60">{result.name}</p>
                <p className="mt-1 font-display text-lg font-semibold text-white">
                  {STATUS_LABELS[result.status] ?? result.status}
                </p>
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
