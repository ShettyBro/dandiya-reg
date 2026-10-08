import { useRef, useState } from "react";
import { motion } from "motion/react";
import { Camera, CheckCircle, Circle, IdentificationCard } from "@phosphor-icons/react";
import { FormField } from "../../components/ui/FormField.js";
import { CustomSelect } from "../../components/ui/CustomSelect.js";
import { Button } from "../../components/ui/Button.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import {
  IDENTITY_IMAGE_MAX_BYTES,
  cropToSquare,
  putFileToPresignedUrl,
  validateImageFile,
  validateProofFile
} from "../../lib/upload.js";
import { ACHARYA_INSTITUTIONS, YEAR_OPTIONS, type RegistrationType } from "./registrationTypes.js";

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

function emailError(value: string, requireAcharyaDomain: boolean): string | null {
  if (!value) return null;
  if (!EMAIL_SHAPE_REGEX.test(value.trim())) return "Enter a valid email address";
  if (requireAcharyaDomain && !value.trim().toLowerCase().endsWith("@acharya.ac.in")) {
    return "Must be a valid @acharya.ac.in email address";
  }
  return null;
}

interface PresignResponse {
  uploadUrl: string;
  objectKey: string;
}

interface CreateRegistrationResponse {
  registrationId: string;
  publicCode: string;
}

const TYPE_LABELS: Record<RegistrationType, string> = {
  ACHARYA_STUDENT: "Acharya Student",
  ACHARYA_FACULTY: "Acharya Faculty",
  ACHARYA_ALUMNI: "Acharya Alumni",
  NON_ACHARYAN_STUDENT: "Non-Acharyan Student"
};

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${done ? "text-emerald-300" : "text-white/40"}`}>
      {done ? <CheckCircle size={16} weight="fill" /> : <Circle size={16} />}
      {label}
    </div>
  );
}

export function DetailsAndUploadStep({
  registrationType,
  idempotencyKey,
  onBack,
  onComplete
}: {
  registrationType: RegistrationType;
  idempotencyKey: string;
  onBack: () => void;
  onComplete: (response: CreateRegistrationResponse) => void;
}) {
  const needsPhoto = registrationType !== "ACHARYA_FACULTY";
  const needsIdentity = registrationType === "NON_ACHARYAN_STUDENT" || registrationType === "ACHARYA_ALUMNI";
  const requireAcharyaDomain = registrationType === "ACHARYA_STUDENT" || registrationType === "ACHARYA_FACULTY";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [auid, setAuid] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [touched, setTouched] = useState<{ phone?: boolean; email?: boolean }>({});

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoRequiredFromServer, setPhotoRequiredFromServer] = useState(false);

  // Local-only progress through the submit sequence — lets a retry after a partial failure (e.g.
  // the photo uploaded fine but the identity doc failed) skip the parts that already succeeded,
  // instead of starting the whole chain over.
  const registrationIdRef = useRef<string | null>(null);
  const publicCodeRef = useRef<string | null>(null);
  const photoDoneRef = useRef(false);
  const identityDoneRef = useRef(false);

  const phoneValidationError = phoneError(phone);
  const emailValidationError = emailError(email, requireAcharyaDomain);

  const fieldsReady =
    name.trim().length > 0 &&
    !phoneValidationError &&
    phone.length > 0 &&
    !emailValidationError &&
    email.length > 0 &&
    (registrationType === "ACHARYA_STUDENT"
      ? auid.trim().length > 0 && institution.length > 0 && year.length > 0
      : registrationType === "ACHARYA_FACULTY"
        ? employeeId.trim().length > 0 && institution.length > 0
        : registrationType === "ACHARYA_ALUMNI"
          ? auid.trim().length > 0
          : collegeName.trim().length > 0);

  const photoReady = !needsPhoto || Boolean(photoFile);
  const identityReady = !needsIdentity || Boolean(identityFile);
  const allReady = fieldsReady && photoReady && identityReady;

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
      photoDoneRef.current = false;
    } finally {
      setPhotoProcessing(false);
    }
  }

  function handleIdentityChange(selected: File | null) {
    setIdentityError(null);
    if (!selected) {
      setIdentityFile(null);
      return;
    }
    const isAlumni = registrationType === "ACHARYA_ALUMNI";
    const error = isAlumni
      ? validateProofFile(selected, IDENTITY_IMAGE_MAX_BYTES)
      : validateImageFile(selected, IDENTITY_IMAGE_MAX_BYTES);
    if (error) {
      setIdentityError(error);
      return;
    }
    setIdentityFile(selected);
    identityDoneRef.current = false;
  }

  async function uploadAndBind(
    file: File,
    purpose: "PARTICIPANT_PHOTO" | "COLLEGE_ID_IMAGE" | "ACHARYAN_PROOF",
    bindPath: string,
    registrationId: string
  ) {
    const presign = await apiRequest<PresignResponse>("/uploads/presign", {
      method: "POST",
      body: { registrationId, purpose, contentType: file.type }
    });
    await putFileToPresignedUrl(presign.uploadUrl, file);
    await apiRequest(`/registrations/${registrationId}/${bindPath}`, {
      method: "PATCH",
      body: { objectKey: presign.objectKey }
    });
  }

  async function handleSubmit() {
    setFormError(null);
    setTouched({ phone: true, email: true });
    setPhotoRequiredFromServer(false);
    if (!allReady) return;

    setSubmitting(true);
    try {
      if (!registrationIdRef.current) {
        const base = { registrationType, name, phone, email };
        const body =
          registrationType === "ACHARYA_STUDENT"
            ? { ...base, auid, institution, year: Number(year) }
            : registrationType === "ACHARYA_FACULTY"
              ? { ...base, employeeId, institution }
              : registrationType === "ACHARYA_ALUMNI"
                ? { ...base, auid }
                : { ...base, collegeName };

        const response = await apiRequest<CreateRegistrationResponse>("/registrations", {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body
        });
        registrationIdRef.current = response.registrationId;
        publicCodeRef.current = response.publicCode;
      }

      const registrationId = registrationIdRef.current;

      if (needsPhoto && photoFile && !photoDoneRef.current) {
        await uploadAndBind(photoFile, "PARTICIPANT_PHOTO", "photo", registrationId);
        photoDoneRef.current = true;
      }

      if (needsIdentity && identityFile && !identityDoneRef.current) {
        const isAlumni = registrationType === "ACHARYA_ALUMNI";
        await uploadAndBind(
          identityFile,
          isAlumni ? "ACHARYAN_PROOF" : "COLLEGE_ID_IMAGE",
          isAlumni ? "acharyan-proof" : "college-id-image",
          registrationId
        );
        identityDoneRef.current = true;
      }

      onComplete({ registrationId, publicCode: publicCodeRef.current as string });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "REGISTRATION_CLOSED") {
          setFormError("Registration is currently closed.");
        } else if (error.code === "NON_ACHARYAN_REGISTRATION_CLOSED") {
          setFormError(error.message);
        } else if (error.code === "VALIDATION_ERROR") {
          setFormError("Please check the highlighted fields and try again.");
        } else if (error.code === "R2_NOT_CONFIGURED") {
          setFormError("Upload storage isn't ready yet on our end. Please try again shortly.");
        } else if (error.code === "IMAGE_VALIDATION_FAILED") {
          setFormError("One of your uploads couldn't be read. Please try a clear JPG/PNG and try again.");
        } else if (error.code === "PHOTO_REQUIRED") {
          setPhotoRequiredFromServer(true);
          setFormError("A required upload is missing — please re-check your photo/identity document above.");
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
    <GlassPanel variant="solid" className="p-6 sm:p-8">
      <button type="button" onClick={onBack} className="mb-3 text-xs text-white/40 underline">
        &larr; Change category
      </button>
      <h2 className="font-display text-xl font-semibold text-white">{TYPE_LABELS[registrationType]}</h2>
      <p className="mt-1 text-sm text-white/60">Fill in your details below.</p>

      {registrationType === "NON_ACHARYAN_STUDENT" && (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">
          Only students from other colleges are eligible for this registration. Public/general registrations
          are not allowed.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
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

        {requireAcharyaDomain ? (
          <FormField
            label="Acharya email"
            type="email"
            placeholder="you@acharya.ac.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            error={touched.email ? (emailValidationError ?? undefined) : undefined}
            required
            autoComplete="email"
          />
        ) : (
          <FormField
            label={registrationType === "NON_ACHARYAN_STUDENT" ? "College email" : "Email"}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            error={touched.email ? (emailValidationError ?? undefined) : undefined}
            required
            autoComplete="email"
          />
        )}

        {registrationType === "ACHARYA_STUDENT" && (
          <>
            <FormField label="AUID" value={auid} onChange={(e) => setAuid(e.target.value)} required />
            <CustomSelect
              label="Institution"
              value={institution}
              onChange={setInstitution}
              placeholder="Select your institution"
              required
              options={ACHARYA_INSTITUTIONS.map((option) => ({ value: option, label: option }))}
            />
            <CustomSelect
              label="Year"
              value={year}
              onChange={setYear}
              placeholder="Select your year"
              required
              options={YEAR_OPTIONS.map((option) => ({ value: String(option), label: `Year ${option}` }))}
            />
          </>
        )}

        {registrationType === "ACHARYA_FACULTY" && (
          <>
            <FormField label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
            <CustomSelect
              label="Institution"
              value={institution}
              onChange={setInstitution}
              placeholder="Select your institution"
              required
              options={ACHARYA_INSTITUTIONS.map((option) => ({ value: option, label: option }))}
            />
          </>
        )}

        {registrationType === "ACHARYA_ALUMNI" && (
          <FormField label="AUID" value={auid} onChange={(e) => setAuid(e.target.value)} required />
        )}

        {registrationType === "NON_ACHARYAN_STUDENT" && (
          <FormField
            label="College name"
            value={collegeName}
            onChange={(e) => setCollegeName(e.target.value)}
            required
          />
        )}

        {needsPhoto && (
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
            {photoRequiredFromServer && !photoFile && (
              <p className="mt-2 text-xs text-red-300">A photo is required.</p>
            )}
          </div>
        )}

        {needsIdentity && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 flex items-center gap-2 text-festival-gold">
              <IdentificationCard size={18} />
              <p className="text-sm font-medium text-white">
                {registrationType === "ACHARYA_ALUMNI" ? "Proof of being an Acharyan" : "College ID card image"}
              </p>
            </div>
            <p className="mb-3 text-xs text-white/50">
              {registrationType === "ACHARYA_ALUMNI"
                ? "Old ID card, degree certificate, admit card, etc. — JPG, PNG, or PDF, max 1MB."
                : "JPG/PNG, max 1MB."}
            </p>
            <input
              type="file"
              accept={registrationType === "ACHARYA_ALUMNI" ? "image/jpeg,image/png,application/pdf" : "image/jpeg,image/png"}
              onChange={(e) => handleIdentityChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-white/70 file:mr-4 file:rounded-pill file:border-0 file:bg-festival-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-midnight-950"
            />
            {identityFile && <p className="mt-1 text-xs text-white/50">{identityFile.name}</p>}
            {identityError && <p className="mt-2 text-xs text-red-300">{identityError}</p>}
            <p className="mt-2 text-xs text-white/40">
              You must still carry your physical ID to the event — this upload is for verification only and
              does not replace it.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <ChecklistItem done={fieldsReady} label="All details filled in" />
          {needsPhoto && <ChecklistItem done={Boolean(photoFile)} label="Photo selected" />}
          {needsIdentity && <ChecklistItem done={Boolean(identityFile)} label="Identity document selected" />}
        </div>

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <motion.div
          animate={{ scale: allReady ? 1 : 0.97, opacity: allReady ? 1 : 0.55 }}
          transition={{ type: "spring", stiffness: 400, damping: 24 }}
        >
          <Button type="button" onClick={handleSubmit} disabled={!allReady || submitting} className="w-full">
            {submitting ? "Submitting..." : "Pay now"}
          </Button>
        </motion.div>
      </div>
    </GlassPanel>
  );
}
