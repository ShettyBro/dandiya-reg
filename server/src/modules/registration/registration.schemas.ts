import { z } from "zod";
import { normalizeIndianPhone, INDIAN_PHONE_REGEX } from "../../lib/security/phone.js";

export const ACHARYA_INSTITUTIONS = [
  "acharya institute of technology",
  "acharya institute of graduate studies",
  "acharya polytechnic",
  "acharya bm reddy college of pharmacy",
  "smt nagarathnamma college of nursing",
  "acharya nrv school of architecture",
  "acharya school of design",
  "acharya institute of allied health sciences",
  "acharya nr institute of physiotherapy",
  "acharya pu college"
] as const;

const ACHARYA_EMAIL_DOMAIN = "@acharya.ac.in";

const lowercaseText = (value: string) => value.trim().toLowerCase();

const phoneSchema = z
  .string()
  .trim()
  .transform(normalizeIndianPhone)
  .refine((value) => INDIAN_PHONE_REGEX.test(value), {
    message: "Enter a valid 10-digit Indian mobile number starting with 6-9"
  });

const acharyaEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .refine((value) => value.endsWith(ACHARYA_EMAIL_DOMAIN), {
    message: `Must be a valid ${ACHARYA_EMAIL_DOMAIN} email address`
  });

const nameSchema = z.string().trim().min(2).max(120).transform(lowercaseText);

// Accepts any casing (the frontend displays Title Case for readability) and normalizes to the
// stored lowercase form before checking it against the fixed institution list.
const institutionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(ACHARYA_INSTITUTIONS));

export const acharyaStudentSchema = z.object({
  registrationType: z.literal("ACHARYA_STUDENT"),
  name: nameSchema,
  email: acharyaEmailSchema,
  auid: z.string().trim().min(2).max(40).transform(lowercaseText),
  institution: institutionSchema,
  year: z.coerce.number().int().min(1).max(8),
  phone: phoneSchema
});

export const acharyaFacultySchema = z.object({
  registrationType: z.literal("ACHARYA_FACULTY"),
  name: nameSchema,
  email: acharyaEmailSchema,
  employeeId: z.string().trim().min(2).max(40).transform(lowercaseText),
  institution: institutionSchema,
  phone: phoneSchema
});

export const nonAcharyanStudentSchema = z.object({
  registrationType: z.literal("NON_ACHARYAN_STUDENT"),
  name: nameSchema,
  email: z.string().trim().toLowerCase().email(),
  phone: phoneSchema,
  collegeName: z.string().trim().min(2).max(200).transform(lowercaseText),
  aadhaarNumber: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^\d+$/, "Aadhaar number must contain digits only")
});

export const registrationSchema = z.discriminatedUnion("registrationType", [
  acharyaStudentSchema,
  acharyaFacultySchema,
  nonAcharyanStudentSchema
]);

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type AcharyaStudentInput = z.infer<typeof acharyaStudentSchema>;
export type AcharyaFacultyInput = z.infer<typeof acharyaFacultySchema>;
export type NonAcharyanStudentInput = z.infer<typeof nonAcharyanStudentSchema>;
