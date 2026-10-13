import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Camera, CheckCircle, Circle, ShieldCheck, UserCircle } from "@phosphor-icons/react";
import { SiteNav } from "../components/layout/SiteNav.js";
import { SiteFooter } from "../components/layout/SiteFooter.js";
import { Container } from "../components/ui/Container.js";
import { GlassPanel } from "../components/ui/GlassPanel.js";
import { FormField } from "../components/ui/FormField.js";
import { Button } from "../components/ui/Button.js";
import { apiRequest, ApiError } from "../lib/api.js";
import { IDENTITY_IMAGE_MAX_BYTES, cropToSquare, putFileToPresignedUrl, validateImageFile } from "../lib/upload.js";

type MyPeopleType = "MY_PEOPLE_ADMIN" | "MY_PEOPLE_REGULAR";

const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_SHAPE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhoneForCheck(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function normalizePhoneInput(raw: string): string {
  return normalizePhoneForCheck(raw).slice(0, 10);
}

function phoneError(value: string): string | null {
  if (!value) return null;
  return INDIAN_PHONE_REGEX.test(normalizePhoneForCheck(value))
    ? null
    : "Enter a valid 10-digit mobile number starting with 6-9";
}

function emailError(value: string): string | null {
  if (!value) return null;
  return EMAIL_SHAPE_REGEX.test(value.trim()) ? null : "Enter a valid email address";
}

function createIdempotencyKey(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random()}`;
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${done ? "text-emerald-300" : "text-white/40"}`}>
      {done ? <CheckCircle size={16} weight="fill" /> : <Circle size={16} />}
      {label}
    </div>
  );
}

export function MyPeoplePage() {
  const [idempotencyKey] = useState(createIdempotencyKey);
  const [registrationType, setRegistrationType] = useState<MyPeopleType>("MY_PEOPLE_REGULAR");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState<{ phone?: boolean; email?: boolean }>({});

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [publicCode, setPublicCode] = useState<string | null>(null);

  const phoneValidationError = phoneError(phone);
  const emailValidationError = emailError(email);

  const fieldsReady =
    name.trim().length > 0 && !phoneValidationError && phone.length > 0 && !emailValidationError && email.length > 0;
  const allReady = fieldsReady && Boolean(photoFile);

  async function handlePhotoChange(selected: File | null) {
    setPhotoError(null);
    if (!selected) {
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      return;
    }
    const validationError = validateImageFile(selected, IDENTITY_IMAGE_MAX_BYTES);
    if (validationError) {
      setPhotoError(validationError);
      return;
    }
    setPhotoProcessing(true);
    try {
      const squared = await cropToSquare(selected);
      const squaredError = validateImageFile(squared, IDENTITY_IMAGE_MAX_BYTES);
      if (squaredError) {
        setPhotoError(squaredError);
        return;
      }
      setPhotoFile(squared);
      setPhotoPreviewUrl(URL.createObjectURL(squared));
    } finally {
      setPhotoProcessing(false);
    }
  }

  async function handleSubmit() {
    setFormError(null);
    setTouched({ phone: true, email: true });
    if (!allReady || !photoFile) return;

    setSubmitting(true);
    try {
      const registration = await apiRequest<{ registrationId: string; publicCode: string }>("/registrations", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { registrationType, name, phone, email }
      });

      const presign = await apiRequest<{ uploadUrl: string; objectKey: string }>("/uploads/presign", {
        method: "POST",
        body: { registrationId: registration.registrationId, purpose: "PARTICIPANT_PHOTO", contentType: photoFile.type }
      });
      await putFileToPresignedUrl(presign.uploadUrl, photoFile);
      await apiRequest(`/registrations/${registration.registrationId}/photo`, {
        method: "PATCH",
        body: { objectKey: presign.objectKey }
      });

      setPublicCode(registration.publicCode);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "VALIDATION_ERROR") {
          setFormError("Please check the highlighted fields and try again.");
        } else if (error.code === "R2_NOT_CONFIGURED") {
          setFormError("Upload storage isn't ready yet on our end. Please try again shortly.");
        } else if (error.code === "IMAGE_VALIDATION_FAILED") {
          setFormError("Your photo couldn't be read. Please try a clear JPG/PNG and try again.");
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <SiteNav minimal />
      <main className="relative z-10 flex-1 py-16">
        <Container className="max-w-xl">
          {publicCode ? (
            <GlassPanel variant="solid" className="flex flex-col items-center gap-4 p-8 text-center">
              <CheckCircle size={48} weight="fill" className="text-festival-gold" />
              <h2 className="font-display text-xl font-semibold text-white">Submitted</h2>
              <p className="max-w-sm text-sm text-white/70">
                Your registration code is <span className="font-semibold text-festival-gold">{publicCode}</span>.
                It's awaiting approval — once approved, you'll get an email with your QR pass.
              </p>
            </GlassPanel>
          ) : (
            <GlassPanel variant="solid" className="p-6 sm:p-8">
              <h1 className="font-display text-xl font-semibold text-white sm:text-2xl">Registration</h1>
              <p className="mt-1 text-sm text-white/60">Fill in your details below.</p>

              <div className="mt-6 flex flex-col gap-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-white/85">Registration type</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRegistrationType("MY_PEOPLE_REGULAR")}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                        registrationType === "MY_PEOPLE_REGULAR"
                          ? "border-festival-gold bg-festival-gold/10 text-white"
                          : "border-white/15 bg-white/5 text-white/60 hover:border-white/30"
                      }`}
                    >
                      <UserCircle size={20} />
                      <span className="text-sm font-medium">Regular</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegistrationType("MY_PEOPLE_ADMIN")}
                      className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                        registrationType === "MY_PEOPLE_ADMIN"
                          ? "border-festival-gold bg-festival-gold/10 text-white"
                          : "border-white/15 bg-white/5 text-white/60 hover:border-white/30"
                      }`}
                    >
                      <ShieldCheck size={20} />
                      <span className="text-sm font-medium">Admin</span>
                    </button>
                  </div>
                </div>

                <FormField label="Full name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
                <FormField
                  label="Phone number"
                  type="tel"
                  prefix="+91"
                  value={phone}
                  onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
                  onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                  error={touched.phone ? (phoneValidationError ?? undefined) : undefined}
                  required
                  autoComplete="tel"
                  placeholder="9876543210"
                />
                <FormField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  error={touched.email ? (emailValidationError ?? undefined) : undefined}
                  required
                  autoComplete="email"
                />

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <p className="mb-1 text-sm font-medium text-white/85">Passport-style photo</p>
                  <p className="mb-3 text-xs text-white/50">
                    Well-lit JPG/PNG, max 1MB. We crop and resize it to a square automatically, so any photo works.
                  </p>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/25 bg-white/5"
                    >
                      {photoPreviewUrl ? (
                        <img src={photoPreviewUrl} alt="Selected preview" className="h-full w-full object-cover" />
                      ) : (
                        <Camera size={24} className="text-white/40" />
                      )}
                    </button>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={photoProcessing}
                        className="rounded-pill border border-festival-gold/40 bg-festival-gold/10 px-4 py-1.5 text-xs font-semibold text-festival-gold disabled:opacity-50"
                      >
                        {photoProcessing ? "Processing..." : photoFile ? "Choose a different photo" : "Choose file"}
                      </button>
                      {photoFile && <p className="text-xs text-white/50">{photoFile.name}</p>}
                    </div>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
                  />
                  {photoError && <p className="mt-2 text-xs text-red-300">{photoError}</p>}
                </div>

                <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <ChecklistItem done={fieldsReady} label="All details filled in" />
                  <ChecklistItem done={Boolean(photoFile)} label="Photo selected" />
                </div>

                {formError && <p className="text-sm text-red-300">{formError}</p>}

                <motion.div
                  animate={{ scale: allReady ? 1 : 0.97, opacity: allReady ? 1 : 0.55 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                >
                  <Button type="button" onClick={handleSubmit} disabled={!allReady || submitting} className="w-full">
                    {submitting ? "Submitting..." : "Submit"}
                  </Button>
                </motion.div>
              </div>
            </GlassPanel>
          )}
        </Container>
      </main>
      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
