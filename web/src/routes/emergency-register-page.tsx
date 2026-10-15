import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { BambooGallery } from "../components/gallery/BambooGallery.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { Button } from "../components/ui/Button.js";
import { apiRequest, ApiError } from "../lib/api.js";
import { useEventConfig } from "../lib/hooks/useEventConfig.js";
import { ProgressIndicator } from "./register/ProgressIndicator.js";
import { AreYouAcharyanStep } from "./register/AreYouAcharyanStep.js";
import { DetailsAndUploadStep } from "./register/DetailsAndUploadStep.js";
import type { RegistrationType } from "./register/registrationTypes.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

function createIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

function CompleteStep({ publicCode, onRegisterAnother }: { publicCode: string; onRegisterAnother: () => void }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = `${API_BASE_URL}/qr-download/pdf?identifier=${encodeURIComponent(publicCode)}`;
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) {
        setDownloadError("Could not generate the QR code. Please try again.");
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `dandiya-qr-${publicCode}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setDownloadError("Could not reach the server. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <GlassPanel variant="solid" className="flex flex-col items-center gap-4 p-8 text-center">
      <CheckCircle size={48} weight="fill" className="text-festival-gold" />
      <h2 className="font-display text-xl font-semibold text-white">Registration complete</h2>
      <p className="max-w-sm text-sm text-white/70">
        Registration code <span className="font-semibold text-festival-gold">{publicCode}</span> is approved.
        A confirmation email with the QR code attached has been sent.
      </p>
      <Button type="button" onClick={handleDownload} disabled={downloading}>
        {downloading ? "Preparing..." : "Download QR code"}
      </Button>
      {downloadError && <p className="text-sm text-red-300">{downloadError}</p>}
      <Button variant="secondary" onClick={onRegisterAnother} className="mt-1">
        Register another person
      </Button>
    </GlassPanel>
  );
}

export function EmergencyRegisterPage() {
  const { config } = useEventConfig();
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] = useState<RegistrationType | null>(null);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [publicCode, setPublicCode] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  function resetForNewRegistration() {
    setIdempotencyKey(createIdempotencyKey());
    setRegistrationType(null);
    setRegistrationId(null);
    setPublicCode(null);
    setCompleteError(null);
    setStep(0);
  }

  async function handleUploadComplete(response: { registrationId: string; publicCode: string }) {
    setRegistrationId(response.registrationId);
    setPublicCode(response.publicCode);
    setCompleting(true);
    setCompleteError(null);
    try {
      await apiRequest(`/registrations/${response.registrationId}/complete-walk-in`, { method: "POST" });
      setStep(2);
    } catch (error) {
      setCompleteError(error instanceof ApiError ? error.message : "Could not complete this registration. Please try again.");
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <BambooGallery />
      <SiteNav minimal />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-xl">
          <h1 className="mb-2 font-display text-2xl font-semibold text-white sm:text-3xl">Register</h1>
          <p className="mb-8 text-sm text-white/60">For people who already paid and just need to finish registering.</p>

          {step > 0 && <ProgressIndicator current={step} />}

          {step === 0 && (
            <AreYouAcharyanStep
              nonAcharyanOpen={Boolean(config?.nonAcharyanRegistrationOpen)}
              studentOpen={Boolean(config?.acharyaStudentRegistrationOpen)}
              facultyOpen={Boolean(config?.acharyaFacultyRegistrationOpen)}
              alumniOpen={Boolean(config?.acharyaAlumniRegistrationOpen)}
              onSelect={(type) => {
                setRegistrationType(type);
                setStep(1);
              }}
            />
          )}

          {step === 1 && registrationType && (
            <>
              <DetailsAndUploadStep
                registrationType={registrationType}
                idempotencyKey={idempotencyKey}
                onBack={() => setStep(0)}
                onComplete={handleUploadComplete}
                submitLabel="Complete registration"
                skipPhoto
              />
              {completing && <p className="mt-4 text-center text-sm text-white/60">Finishing registration...</p>}
              {completeError && <p className="mt-4 text-center text-sm text-red-300">{completeError}</p>}
            </>
          )}

          {step === 2 && registrationId && publicCode && (
            <CompleteStep publicCode={publicCode} onRegisterAnother={resetForNewRegistration} />
          )}
        </Container>
      </main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
