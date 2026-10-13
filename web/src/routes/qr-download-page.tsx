import { useEffect, useRef, useState, type FormEvent } from "react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { FormField } from "../components/ui/FormField.js";
import { Button } from "../components/ui/Button.js";
import { apiRequest, ApiError, SERVER_UNREACHABLE_CODE } from "../lib/api.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

interface LookupResult {
  found: boolean;
  ready: boolean;
  status: string | null;
  name: string | null;
  publicCode: string | null;
}

export function QrDownloadPage() {
  const [identifier, setIdentifier] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const metaRef = useRef<HTMLMetaElement | null>(null);

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    metaRef.current = meta;
    return () => {
      metaRef.current?.remove();
    };
  }, []);

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    setLooking(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const response = await apiRequest<LookupResult>("/qr-download/lookup", {
        method: "POST",
        body: { identifier: identifier.trim() }
      });
      setLookupResult(response);
    } catch (error) {
      if (error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE) {
        setLookupError(error.message);
      } else if (error instanceof ApiError && error.status === 404) {
        setLookupError("No registration found. Double-check your phone number, email, registration code, or AUID.");
      } else {
        setLookupError("Something went wrong. Please try again.");
      }
    } finally {
      setLooking(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setLookupError(null);
    try {
      const url = `${API_BASE_URL}/qr-download/pdf?identifier=${encodeURIComponent(identifier.trim())}`;
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) {
        setLookupError("Could not generate the QR code. Please try again.");
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `dandiya-qr-${lookupResult?.publicCode ?? "code"}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setLookupError("Could not reach the server. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-md">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">QR Code Download</h1>
          <p className="mb-8 text-sm text-white/60">
            Enter your registered phone number, email, registration code, or AUID to find and download your QR code.
          </p>

          <GlassPanel className="p-6 sm:p-8">
            <form onSubmit={handleLookup} className="flex flex-col gap-4">
              <FormField
                label="Phone, email, registration code, or AUID"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. 9876543210 or DN26-ABCD12"
                required
              />
              <Button type="submit" disabled={looking}>
                {looking ? "Searching..." : "Find registration"}
              </Button>
            </form>

            {lookupError && <p className="mt-4 text-sm text-red-300">{lookupError}</p>}

            {lookupResult && lookupResult.ready && (
              <div className="mt-6 flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center">
                <p className="text-xs uppercase tracking-[0.1em] text-white/50">Found</p>
                <p className="font-display text-lg font-semibold text-white capitalize">{lookupResult.name}</p>
                <p className="font-mono text-xs text-white/35 tracking-widest">{lookupResult.publicCode}</p>
                <Button type="button" onClick={handleDownload} disabled={downloading} className="mt-2">
                  {downloading ? "Preparing..." : "Download QR code"}
                </Button>
              </div>
            )}

            {lookupResult && !lookupResult.ready && (
              <p className="mt-6 rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-300">
                Found a registration, but it's not approved yet (status: {lookupResult.status}). The QR code
                isn't available until payment is approved.
              </p>
            )}
          </GlassPanel>
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
