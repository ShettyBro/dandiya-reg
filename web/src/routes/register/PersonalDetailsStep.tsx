import { useState, type FormEvent } from "react";
import { FormField } from "../../components/ui/FormField.js";
import { Button } from "../../components/ui/Button.js";
import { GlassPanel } from "../../components/ui/GlassPanel.js";
import { apiRequest, ApiError } from "../../lib/api.js";

export interface PersonalDetails {
  name: string;
  phone: string;
  email: string;
  college: string;
  semester: string;
  branch: string;
}

interface CreateRegistrationResponse {
  registrationId: string;
  publicCode: string;
  eightDigitCode: string;
  status: string;
}

export function PersonalDetailsStep({
  idempotencyKey,
  onComplete
}: {
  idempotencyKey: string;
  onComplete: (details: PersonalDetails, response: CreateRegistrationResponse) => void;
}) {
  const [values, setValues] = useState<PersonalDetails>({
    name: "",
    phone: "",
    email: "",
    college: "",
    semester: "",
    branch: ""
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: keyof PersonalDetails, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    setErrors({});

    if (!values.email.trim().toLowerCase().endsWith("@acharya.ac.in")) {
      setErrors({ email: "Only @acharya.ac.in college email addresses are eligible" });
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiRequest<CreateRegistrationResponse>("/registrations", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: values
      });
      onComplete(values, response);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "REGISTRATION_CLOSED") {
          setFormError("Registration is currently closed.");
        } else if (error.code === "CAPACITY_EXCEEDED") {
          setFormError("Event capacity has been reached.");
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
      <h2 className="font-display text-xl font-semibold text-white">Your details</h2>
      <p className="mt-1 text-sm text-white/60">Only current students of this campus are eligible.</p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
        <FormField
          label="Full name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          required
          autoComplete="name"
        />
        <FormField
          label="Phone number"
          type="tel"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          required
          autoComplete="tel"
        />
        <FormField
          label="College email"
          type="email"
          placeholder="you@acharya.ac.in"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          error={errors.email}
          required
          autoComplete="email"
        />
        <FormField
          label="College"
          value={values.college}
          onChange={(e) => update("college", e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label="Semester"
            value={values.semester}
            onChange={(e) => update("semester", e.target.value)}
            required
          />
          <FormField
            label="Branch"
            value={values.branch}
            onChange={(e) => update("branch", e.target.value)}
            required
          />
        </div>

        {formError && <p className="text-sm text-red-300">{formError}</p>}

        <Button type="submit" disabled={submitting} className="mt-2">
          {submitting ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </GlassPanel>
  );
}
