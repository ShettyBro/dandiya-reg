import { useState, type FormEvent } from "react";
import { FormField } from "../../components/ui/FormField.js";
import { CustomSelect } from "../../components/ui/CustomSelect.js";
import { Button } from "../../components/ui/Button.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { apiRequest, ApiError } from "../../lib/api.js";
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

interface CreateRegistrationResponse {
  registrationId: string;
  publicCode: string;
  eightDigitCode: string;
  status: string;
}

const TYPE_LABELS: Record<RegistrationType, string> = {
  ACHARYA_STUDENT: "Acharya Student",
  ACHARYA_FACULTY: "Acharya Faculty",
  NON_ACHARYAN_STUDENT: "Non-Acharyan Student"
};

export function PersonalDetailsStep({
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [auid, setAuid] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [institution, setInstitution] = useState("");
  const [year, setYear] = useState("");
  const [collegeName, setCollegeName] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<{ phone?: boolean; email?: boolean }>({});

  const requireAcharyaDomain = registrationType !== "NON_ACHARYAN_STUDENT";
  const phoneValidationError = phoneError(phone);
  const emailValidationError = emailError(email, requireAcharyaDomain);
  const hasBlockingFieldErrors = Boolean(phoneValidationError || emailValidationError);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setTouched({ phone: true, email: true });
    if (hasBlockingFieldErrors) {
      return;
    }
    setSubmitting(true);

    const base = { registrationType, name, phone, email };
    const body =
      registrationType === "ACHARYA_STUDENT"
        ? { ...base, auid, institution, year: Number(year) }
        : registrationType === "ACHARYA_FACULTY"
          ? { ...base, employeeId, institution }
          : { ...base, collegeName, aadhaarNumber };

    try {
      const response = await apiRequest<CreateRegistrationResponse>("/registrations", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body
      });
      onComplete(response);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "REGISTRATION_CLOSED") {
          setFormError("Registration is currently closed.");
        } else if (error.code === "VALIDATION_ERROR") {
          setFormError("Please check the highlighted fields and try again.");
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

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
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

        {registrationType === "NON_ACHARYAN_STUDENT" ? (
          <FormField
            label="College email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
            error={touched.email ? (emailValidationError ?? undefined) : undefined}
            required
            autoComplete="email"
          />
        ) : (
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

        {registrationType === "NON_ACHARYAN_STUDENT" && (
          <>
            <FormField
              label="College name"
              value={collegeName}
              onChange={(e) => setCollegeName(e.target.value)}
              required
            />
            <FormField
              label="Aadhaar number"
              value={aadhaarNumber}
              onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              required
            />
          </>
        )}

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <Button type="submit" disabled={submitting || (Boolean(touched.phone || touched.email) && hasBlockingFieldErrors)} className="mt-2">
          {submitting ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </GlassPanel>
  );
}
