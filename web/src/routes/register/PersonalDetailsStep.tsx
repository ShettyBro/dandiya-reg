import { useState, type FormEvent } from "react";
import { FormField } from "../../components/ui/FormField.js";
import { SelectField } from "../../components/ui/SelectField.js";
import { Button } from "../../components/ui/Button.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { apiRequest, ApiError } from "../../lib/api.js";
import { ACHARYA_INSTITUTIONS, YEAR_OPTIONS, type RegistrationType } from "./registrationTypes.js";

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

const DUPLICATE_MESSAGES: Record<string, string> = {
  DUPLICATE_AUID: "This AUID is already registered.",
  DUPLICATE_EMPLOYEE_ID: "This Employee ID is already registered.",
  DUPLICATE_AADHAAR: "This Aadhaar number is already registered.",
  DUPLICATE_PHONE: "This phone number is already registered for this category."
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
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
        } else if (DUPLICATE_MESSAGES[error.code] !== undefined) {
          setFormError(DUPLICATE_MESSAGES[error.code] ?? null);
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
    <GlassPanel className="p-6 sm:p-8">
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
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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
            required
            autoComplete="email"
          />
        )}

        {registrationType === "ACHARYA_STUDENT" && (
          <>
            <FormField label="AUID" value={auid} onChange={(e) => setAuid(e.target.value)} required />
            <SelectField label="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} required>
              <option value="" disabled>
                Select your institution
              </option>
              {ACHARYA_INSTITUTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
            <SelectField label="Year" value={year} onChange={(e) => setYear(e.target.value)} required>
              <option value="" disabled>
                Select your year
              </option>
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Year {option}
                </option>
              ))}
            </SelectField>
          </>
        )}

        {registrationType === "ACHARYA_FACULTY" && (
          <>
            <FormField label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
            <SelectField label="Institution" value={institution} onChange={(e) => setInstitution(e.target.value)} required>
              <option value="" disabled>
                Select your institution
              </option>
              {ACHARYA_INSTITUTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectField>
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

        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </GlassPanel>
  );
}
