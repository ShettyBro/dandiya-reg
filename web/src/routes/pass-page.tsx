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

interface LookupResponse {
  registrationId: string;
  eligible: boolean;
}

interface PassData {
  name: string;
  publicCode: string;
  eightDigitCode: string;
  photoUrl: string | null;
  qrImageDataUrl: string;
}

export function PassPage() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [pass, setPass] = useState<PassData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPass(null);
    const trimmedCode = code.trim();

    try {
      const lookup = await apiRequest<LookupResponse>("/pass/lookup", {
        method: "POST",
        body: { code: trimmedCode }
      });

      if (!lookup.eligible) {
        setError("Your payment hasn't been approved yet, so your Dandiya Celebration Kit QR isn't ready.");
        return;
      }

      const passData = await apiRequest<PassData>(
        `/pass/${lookup.registrationId}?code=${encodeURIComponent(trimmedCode)}`
      );
      setPass(passData);
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
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-md">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">
            Dandiya Celebration Kit QR
          </h1>
          <p className="mb-8 text-sm text-white/60">Enter your registration code to view your Celebration Kit QR.</p>

          <GlassPanel className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FormField label="Registration code" value={code} onChange={(e) => setCode(e.target.value)} required />
              <Button type="submit" disabled={loading}>
                {loading ? "Loading..." : "View my QR"}
              </Button>
            </form>

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            {pass && (
              <div className="mt-6 flex flex-col items-center gap-4 border-t border-white/10 pt-6 text-center">
                {pass.photoUrl && (
                  <img
                    src={pass.photoUrl}
                    alt={pass.name}
                    className="h-24 w-24 rounded-full border-2 border-festival-gold object-cover"
                  />
                )}
                <p className="font-display text-lg font-semibold text-white">{pass.name}</p>
                <p className="text-xs uppercase tracking-[0.1em] text-white/50">{pass.publicCode}</p>
                <img src={pass.qrImageDataUrl} alt="Dandiya Celebration Kit QR" className="h-56 w-56 rounded-xl bg-white p-3" />
                <p className="text-xs text-white/50">Present this QR at the venue to collect your Dandiya Celebration Kit.</p>
                <p className="text-xs text-white/40">The same QR code will be verified by the event team during venue entry.</p>
              </div>
            )}
          </GlassPanel>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
