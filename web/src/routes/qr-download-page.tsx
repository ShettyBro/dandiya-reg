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
const STORAGE_KEY = "dandiya-qr-download-session";

interface StoredSession {
  sessionToken: string;
  expiresAt: number;
}

interface LookupResult {
  found: boolean;
  ready: boolean;
  status: string | null;
  name: string | null;
  publicCode: string | null;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (typeof parsed.sessionToken !== "string" || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function QrDownloadPage() {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession());
  const [now, setNow] = useState(Date.now());

  const [accessCode, setAccessCode] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const [phone, setPhone] = useState("");
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

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (session && session.expiresAt <= now) {
      setSession(null);
      sessionStorage.removeItem(STORAGE_KEY);
      setLookupResult(null);
    }
  }, [session, now]);

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError(null);
    try {
      const response = await apiRequest<{ sessionToken: string; expiresInSeconds: number }>("/qr-download/unlock", {
        method: "POST",
        body: { accessCode: accessCode.trim() }
      });
      const stored: StoredSession = {
        sessionToken: response.sessionToken,
        expiresAt: Date.now() + response.expiresInSeconds * 1000
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setSession(stored);
      setAccessCode("");
    } catch (error) {
      if (error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE) {
        setUnlockError(error.message);
      } else if (error instanceof ApiError && error.status === 401) {
        setUnlockError("That code is incorrect or has expired.");
      } else {
        setUnlockError("Something went wrong. Please try again.");
      }
    } finally {
      setUnlocking(false);
    }
  }

  function expireSession() {
    setSession(null);
    sessionStorage.removeItem(STORAGE_KEY);
    setLookupResult(null);
  }

  async function handleLookup(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setLooking(true);
    setLookupError(null);
    setLookupResult(null);
    try {
      const response = await apiRequest<LookupResult>("/qr-download/lookup", {
        method: "POST",
        body: { sessionToken: session.sessionToken, phone: phone.trim() }
      });
      setLookupResult(response);
    } catch (error) {
      if (error instanceof ApiError && error.code === SERVER_UNREACHABLE_CODE) {
        setLookupError(error.message);
      } else if (error instanceof ApiError && error.status === 401) {
        expireSession();
        setLookupError("Your session expired. Enter the current code again.");
      } else if (error instanceof ApiError && error.status === 404) {
        setLookupError("No registration found for that phone number.");
      } else {
        setLookupError("Something went wrong. Please try again.");
      }
    } finally {
      setLooking(false);
    }
  }

  async function handleDownload() {
    if (!session) return;
    setDownloading(true);
    setLookupError(null);
    try {
      const url = `${API_BASE_URL}/qr-download/pdf?sessionToken=${encodeURIComponent(
        session.sessionToken
      )}&phone=${encodeURIComponent(phone.trim())}`;
      const response = await fetch(url, { credentials: "omit" });
      if (response.status === 401) {
        expireSession();
        setLookupError("Your session expired. Enter the current code again.");
        return;
      }
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

  const unlocked = Boolean(session && session.expiresAt > now);
  const remainingMs = session ? session.expiresAt - now : 0;

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-md">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">QR Code Download</h1>
          <p className="mb-8 text-sm text-white/60">Enter the current access code to continue.</p>

          <GlassPanel className="p-6 sm:p-8">
            {!unlocked && (
              <form onSubmit={handleUnlock} className="flex flex-col gap-5">
                <FormField
                  label="Access code"
                  value={accessCode}
                  onChange={(e) => setAccessCode(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit code"
                  required
                  className="text-center text-lg tracking-[0.3em]"
                />
                <Button type="submit" disabled={unlocking}>
                  {unlocking ? "Checking..." : "Unlock"}
                </Button>
                {unlockError && <p className="text-sm text-red-300">{unlockError}</p>}
              </form>
            )}

            {unlocked && (
              <div className="flex flex-col gap-5">
                <p className="text-center text-xs uppercase tracking-[0.1em] text-emerald-300">
                  Unlocked — expires in {formatRemaining(remainingMs)}
                </p>

                <form onSubmit={handleLookup} className="flex flex-col gap-4">
                  <FormField
                    label="Registered phone number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    required
                  />
                  <Button type="submit" variant="secondary" disabled={looking}>
                    {looking ? "Searching..." : "Find registration"}
                  </Button>
                </form>

                {lookupError && <p className="text-sm text-red-300">{lookupError}</p>}

                {lookupResult && lookupResult.ready && (
                  <div className="flex flex-col items-center gap-3 border-t border-white/10 pt-6 text-center">
                    <p className="text-xs uppercase tracking-[0.1em] text-white/50">Found</p>
                    <p className="font-display text-lg font-semibold text-white capitalize">{lookupResult.name}</p>
                    <p className="font-mono text-xs text-white/35 tracking-widest">{lookupResult.publicCode}</p>
                    <Button type="button" onClick={handleDownload} disabled={downloading} className="mt-2">
                      {downloading ? "Preparing..." : "Download QR code"}
                    </Button>
                  </div>
                )}

                {lookupResult && !lookupResult.ready && (
                  <p className="rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-sm text-amber-300">
                    Found a registration, but it's not approved yet (status: {lookupResult.status}). The QR code
                    isn't available until payment is approved.
                  </p>
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
