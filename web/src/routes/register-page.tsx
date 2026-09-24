import { useEffect, useState } from "react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
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
  const [idempotencyKey] = useState(() => restored?.idempotencyKey ?? createIdempotencyKey());
  const [step, setStep] = useState(restored?.step ?? 0);
  const [registrationType, setRegistrationType] = useState<RegistrationType | null>(restored?.registrationType ?? null);
  const [registrationId, setRegistrationId] = useState<string | null>(restored?.registrationId ?? null);
  const [publicCode, setPublicCode] = useState<string | null>(restored?.publicCode ?? null);
  const checkingAvailability = step === 0 && configLoading;
  const closedForNewRegistrations = step === 0 && !configLoading && config !== null && !config.registrationOpen;
  const needsIdentityStep = registrationType === "NON_ACHARYAN_STUDENT" || registrationType === "ACHARYA_ALUMNI";

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

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav minimal />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-xl">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">Register</h1>
          <p className="mb-8 text-sm text-white/60">Mobile-friendly, takes about two minutes.</p>

          {step > 0 && <ProgressIndicator current={step} showIdentity={needsIdentityStep} />}

          {checkingAvailability && (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-sm text-white/60">Checking registration availability...</p>
            </GlassPanel>
          )}

          {closedForNewRegistrations && (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="font-display text-lg font-semibold text-white">Registration is currently closed</p>
              <p className="text-sm text-white/60">Follow the college channels for any updates.</p>
            </GlassPanel>
          )}

          {!checkingAvailability && !closedForNewRegistrations && step === 0 && (
            <AreYouAcharyanStep
              onSelect={(type) => {
                setRegistrationType(type);
                setStep(1);
              }}
            />
          )}

          {step === 1 && registrationType && (
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

          {step === 2 && registrationId && (
            <PhotoUploadStep
              registrationId={registrationId}
              onComplete={() => setStep(needsIdentityStep ? 3 : 4)}
            />
          )}

          {step === 3 && registrationId && registrationType && needsIdentityStep && (
            <IdentityUploadStep
              registrationId={registrationId}
              registrationType={registrationType}
              onComplete={() => setStep(4)}
            />
          )}

          {step === 4 && registrationId && (
            <PaymentStep registrationId={registrationId} onComplete={() => setStep(5)} />
          )}

          {step === 5 && publicCode && <SuccessStep publicCode={publicCode} />}
        </Container>
      </main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
