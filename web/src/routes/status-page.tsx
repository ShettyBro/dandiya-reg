import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  const [query, setQuery] = useState(searchParams.get("code") ?? "");
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiRequest<StatusResponse>("/registrations/status/lookup", {
        method: "POST",
        body: { query: query.trim() }
      });
      setResult(response);
    } catch (fetchError) {
      if (fetchError instanceof ApiError && fetchError.code === SERVER_UNREACHABLE_CODE) {
        setError(fetchError.message);
      } else if (fetchError instanceof ApiError && fetchError.status === 404) {
        setError("No registration found for that code or phone number.");
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
            Enter your registration code or your registered phone number — either works.
          </p>

          <GlassPanel className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FormField
                label="Registration code or phone number"
                placeholder="e.g. DN26-B7WZG5 or 9876543210"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
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
                  <>
                    <p className="mt-3 rounded-xl border border-festival-gold/25 bg-festival-gold/8 px-4 py-3 text-sm text-festival-gold">
                      Your Dandiya Celebration Kit will be provided at the event venue.
                    </p>
                    <p className="mt-3 text-center text-sm text-white/50">
                      Didn't receive the email with your QR code?{" "}
                      <Link to="/qr-down" className="text-festival-gold underline underline-offset-2">
                        Click here
                      </Link>
                    </p>
                  </>
                )}
                {REJECTED_STATUSES.has(result.status) && result.rejectionReason && (
                  <>
                    <p className="mt-2 text-sm text-red-300">Reason: {result.rejectionReason}</p>
                    <div className="mt-3 rounded-xl border border-red-400/25 bg-red-400/8 px-4 py-3 text-sm text-white/80">
                      <p className="font-semibold text-red-200">You do NOT need to pay again.</p>
                      <p className="mt-1 text-xs text-white/70">
                        Fill the registration form again with the same details, and upload the same
                        payment screenshot and the same transaction ID you already have — your money has
                        already been paid. Only make a new payment if the rejection reason above
                        specifically says the payment itself was wrong (e.g. wrong amount or unreadable
                        screenshot).
                      </p>
                    </div>
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

