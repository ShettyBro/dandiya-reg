import { useEffect, useState } from "react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { apiRequest } from "../lib/api.js";
import { useEventConfig } from "../lib/hooks/useEventConfig.js";
import { ProgressIndicator } from "./register/ProgressIndicator.js";
import { AreYouAcharyanStep } from "./register/AreYouAcharyanStep.js";
import { PersonalDetailsStep } from "./register/PersonalDetailsStep.js";
import { PhotoUploadStep } from "./register/PhotoUploadStep.js";
import { IdentityUploadStep } from "./register/IdentityUploadStep.js";
import { PaymentStep } from "./register/PaymentStep.js";
import { SuccessStep } from "./register/SuccessStep.js";
import { clearRegistrationProgress, loadRegistrationProgress, saveRegistrationProgress } from "./register/registrationProgress.js";
import type { RegistrationType } from "./register/registrationTypes.js";

function createIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

export function RegisterPage() {
  const { config, loading: configLoading } = useEventConfig();
  const restored = useState(loadRegistrationProgress)[0];
  const [idempotencyKey, setIdempotencyKey] = useState(() => restored?.idempotencyKey ?? createIdempotencyKey());
  const [step, setStep] = useState(restored?.step ?? 0);
  const [registrationType, setRegistrationType] = useState<RegistrationType | null>(restored?.registrationType ?? null);
  const [registrationId, setRegistrationId] = useState<string | null>(restored?.registrationId ?? null);
  const [publicCode, setPublicCode] = useState<string | null>(restored?.publicCode ?? null);
  const [verifying, setVerifying] = useState(Boolean(restored?.registrationId));
  const checkingAvailability = step === 0 && configLoading;
  const closedForNewRegistrations = step === 0 && !configLoading && config !== null && !config.registrationOpen;
  const needsIdentityStep = registrationType === "NON_ACHARYAN_STUDENT" || registrationType === "ACHARYA_ALUMNI";

  useEffect(() => {
    // A locally-persisted step number is never trusted on its own to decide what to render —
    // resuming a paused registration (e.g. after the ERP payment redirect) always re-checks with
    // the server which uploads/submissions actually exist, so a stale or desynced step can never
    // skip a mandatory step like identity verification.
    const resumeId = restored?.registrationId;
    if (!resumeId) return;
    let cancelled = false;

    apiRequest<{
      registrationType: RegistrationType;
      publicCode: string;
      hasPhoto: boolean;
      hasIdentityProof: boolean;
      paymentSubmitted: boolean;
    }>(`/registrations/${resumeId}/wizard-state`)
      .then((state) => {
        if (cancelled) return;
        const needsIdentity = state.registrationType === "NON_ACHARYAN_STUDENT" || state.registrationType === "ACHARYA_ALUMNI";
        let correctStep: number;
        if (!state.hasPhoto) correctStep = 2;
        else if (needsIdentity && !state.hasIdentityProof) correctStep = 3;
        else if (!state.paymentSubmitted) correctStep = 4;
        else correctStep = 5;

        setRegistrationType(state.registrationType);
        setPublicCode(state.publicCode);
        setStep(correctStep);
      })
      .catch(() => {
        // Registration no longer exists or is unreachable — don't trust the stale local step,
        // start clean instead.
        if (!cancelled) resetForNewRegistration();
      })
      .finally(() => {
        if (!cancelled) setVerifying(false);
      });

    return () => {
      cancelled = true;
    };
    // Only ever re-validate the progress that was present when this page first mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 0) {
      // Nothing worth resuming yet — avoid persisting a fresh idempotency key for someone who
      // never got past the category picker.
      return;
    }
    if (step >= 5) {
      // Registration finished — clear so the next visit (same device, another registration) starts clean.
      clearRegistrationProgress();
      return;
    }
    saveRegistrationProgress({ idempotencyKey, step, registrationType, registrationId, publicCode });
  }, [idempotencyKey, step, registrationType, registrationId, publicCode]);

  function resetForNewRegistration() {
    clearRegistrationProgress();
    setIdempotencyKey(createIdempotencyKey());
    setRegistrationType(null);
    setRegistrationId(null);
    setPublicCode(null);
    setStep(0);
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav minimal />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-xl">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">Register</h1>
          <p className="mb-8 text-sm text-white/60">Mobile-friendly, takes about two minutes.</p>

          {step > 0 && <ProgressIndicator current={step} showIdentity={needsIdentityStep} />}

          {verifying && (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-white/60">Resuming your registration...</p>
            </GlassPanel>
          )}

          {!verifying && checkingAvailability && (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-white/60">Checking registration availability...</p>
            </GlassPanel>
          )}

          {!verifying && closedForNewRegistrations && (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold text-white">Registration is currently closed</p>
              <p className="text-sm text-white/60">Follow the college channels for any updates.</p>
            </GlassPanel>
          )}

          {!verifying && !checkingAvailability && !closedForNewRegistrations && step === 0 && (
            <AreYouAcharyanStep
              onSelect={(type) => {
                setRegistrationType(type);
                setStep(1);
              }}
            />
          )}

          {!verifying && step === 1 && registrationType && (
            <PersonalDetailsStep
              registrationType={registrationType}
              idempotencyKey={idempotencyKey}
              onBack={() => setStep(0)}
              onComplete={(response) => {
                setRegistrationId(response.registrationId);
                setPublicCode(response.publicCode);
                setStep(2);
              }}
            />
          )}

          {!verifying && step === 2 && registrationId && (
            <PhotoUploadStep
              registrationId={registrationId}
              onBack={() => setStep(1)}
              onComplete={() => setStep(needsIdentityStep ? 3 : 4)}
            />
          )}

          {!verifying && step === 3 && registrationId && registrationType && needsIdentityStep && (
            <IdentityUploadStep
              registrationId={registrationId}
              registrationType={registrationType}
              onBack={() => setStep(2)}
              onComplete={() => setStep(4)}
            />
          )}

          {!verifying && step === 4 && registrationId && registrationType && (
            <PaymentStep
              registrationId={registrationId}
              registrationType={registrationType}
              onBack={() => setStep(needsIdentityStep ? 3 : 2)}
              onComplete={() => setStep(5)}
            />
          )}

          {!verifying && step === 5 && publicCode && (
            <SuccessStep publicCode={publicCode} onRegisterAnother={resetForNewRegistration} />
          )}
        </Container>
      </main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
