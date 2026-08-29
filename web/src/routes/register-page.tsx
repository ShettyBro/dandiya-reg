import { useEffect, useState } from "react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { useEventConfig } from "../lib/hooks/useEventConfig.js";
import { ProgressIndicator } from "./register/ProgressIndicator.js";
import { PersonalDetailsStep } from "./register/PersonalDetailsStep.js";
import { PhotoUploadStep } from "./register/PhotoUploadStep.js";
import { PaymentStep } from "./register/PaymentStep.js";
import { SuccessStep } from "./register/SuccessStep.js";

function createIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

const PROGRESS_STORAGE_KEY = "dn26:registration-progress";

interface StoredProgress {
  step: number;
  registrationId: string | null;
  publicCode: string | null;
}

function loadStoredProgress(): StoredProgress | null {
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProgress;
    if (typeof parsed.step !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function RegisterPage() {
  const { config } = useEventConfig();
  const [idempotencyKey] = useState(createIdempotencyKey);
  const stored = useState(loadStoredProgress)[0];
  const [step, setStep] = useState(stored?.step ?? 1);
  const [registrationId, setRegistrationId] = useState<string | null>(stored?.registrationId ?? null);
  const [publicCode, setPublicCode] = useState<string | null>(stored?.publicCode ?? null);
  const closedForNewRegistrations = step === 1 && !registrationId && config !== null && !config.registrationOpen;

  useEffect(() => {
    if (step === 1 && !registrationId) {
      window.sessionStorage.removeItem(PROGRESS_STORAGE_KEY);
      return;
    }
    try {
      window.sessionStorage.setItem(
        PROGRESS_STORAGE_KEY,
        JSON.stringify({ step, registrationId, publicCode })
      );
    } catch (error) {
      void error;
    }
  }, [step, registrationId, publicCode]);

  return (
    <div className="flex min-h-screen flex-col bg-midnight-950">
      <SiteNav />
      <main className="flex-1 py-16">
        <Container className="max-w-xl">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">Register</h1>
          <p className="mb-8 text-sm text-white/60">Mobile-friendly, takes about two minutes.</p>

          <ProgressIndicator current={step} />

          {closedForNewRegistrations ? (
            <GlassPanel className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold text-white">Registration is currently closed</p>
              <p className="text-sm text-white/60">
                Capacity has been reached or registration has closed. Follow the college channels for any
                last updates.
              </p>
            </GlassPanel>
          ) : (
            step === 1 && (
              <PersonalDetailsStep
                idempotencyKey={idempotencyKey}
                onComplete={(_details, response) => {
                  setRegistrationId(response.registrationId);
                  setPublicCode(response.publicCode);
                  setStep(2);
                }}
              />
            )
          )}

          {step === 2 && registrationId && (
            <PhotoUploadStep
              registrationId={registrationId}
              onComplete={() => setStep(3)}
              onSkip={() => setStep(3)}
            />
          )}

          {step === 3 && registrationId && (
            <PaymentStep registrationId={registrationId} onComplete={() => setStep(4)} />
          )}

          {step === 4 && publicCode && <SuccessStep publicCode={publicCode} />}
        </Container>
      </main>
      <SiteFooter />
    </div>
  );
}
