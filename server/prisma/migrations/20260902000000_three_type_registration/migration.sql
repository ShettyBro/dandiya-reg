-- New enums for the three-type registration model
CREATE TYPE "RegistrationType" AS ENUM ('ACHARYA_STUDENT', 'ACHARYA_FACULTY', 'NON_ACHARYAN_STUDENT');
CREATE TYPE "IdentityStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Extend UploadPurpose with the two new identity-document purposes
ALTER TYPE "UploadPurpose" ADD VALUE 'AADHAAR_IMAGE';
ALTER TYPE "UploadPurpose" ADD VALUE 'COLLEGE_ID_IMAGE';

-- Recreate RegistrationStatus with the new value set (table confirmed empty, safe to recreate)
ALTER TABLE "registrations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "registrations" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
DROP TYPE "RegistrationStatus";
CREATE TYPE "RegistrationStatus" AS ENUM ('PAYMENT_PENDING', 'IDENTITY_PENDING', 'IDENTITY_REJECTED', 'PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED');
ALTER TABLE "registrations" ALTER COLUMN "status" TYPE "RegistrationStatus" USING "status"::"RegistrationStatus";
ALTER TABLE "registrations" ALTER COLUMN "status" SET DEFAULT 'PAYMENT_PENDING';

-- Drop the old generic field set
ALTER TABLE "registrations" DROP COLUMN "college";
ALTER TABLE "registrations" DROP COLUMN "semester";
ALTER TABLE "registrations" DROP COLUMN "branch";

-- Add the type discriminant (table confirmed empty, safe to add NOT NULL directly)
ALTER TABLE "registrations" ADD COLUMN "registrationType" "RegistrationType" NOT NULL;

-- Add type-specific fields
ALTER TABLE "registrations" ADD COLUMN "institution" TEXT;
ALTER TABLE "registrations" ADD COLUMN "auid" TEXT;
ALTER TABLE "registrations" ADD COLUMN "year" INTEGER;
ALTER TABLE "registrations" ADD COLUMN "employeeId" TEXT;
ALTER TABLE "registrations" ADD COLUMN "collegeName" TEXT;
ALTER TABLE "registrations" ADD COLUMN "aadhaarNumber" TEXT;
ALTER TABLE "registrations" ADD COLUMN "aadhaarImageObjectKey" TEXT;
ALTER TABLE "registrations" ADD COLUMN "collegeIdImageObjectKey" TEXT;
ALTER TABLE "registrations" ADD COLUMN "identityStatus" "IdentityStatus";
ALTER TABLE "registrations" ADD COLUMN "identityRejectionReason" TEXT;
ALTER TABLE "registrations" ADD COLUMN "identityVerifiedById" TEXT;
ALTER TABLE "registrations" ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);
ALTER TABLE "registrations" ADD COLUMN "resubmissionOfId" TEXT;

ALTER TABLE "registrations" ADD CONSTRAINT "registrations_identityVerifiedById_fkey" FOREIGN KEY ("identityVerifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_resubmissionOfId_fkey" FOREIGN KEY ("resubmissionOfId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Plain lookup indexes
CREATE INDEX "registrations_registrationType_status_idx" ON "registrations"("registrationType", "status");
CREATE INDEX "registrations_auid_idx" ON "registrations"("auid");
CREATE INDEX "registrations_employeeId_idx" ON "registrations"("employeeId");
CREATE INDEX "registrations_aadhaarNumber_idx" ON "registrations"("aadhaarNumber");

-- Lifecycle-aware uniqueness: unique only among non-rejected registrations, so a rejected
-- record stays for audit/history without permanently blocking a valid resubmission.
CREATE UNIQUE INDEX "registrations_auid_active_key" ON "registrations"("auid")
  WHERE "auid" IS NOT NULL AND "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');
CREATE UNIQUE INDEX "registrations_employee_id_active_key" ON "registrations"("employeeId")
  WHERE "employeeId" IS NOT NULL AND "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');
CREATE UNIQUE INDEX "registrations_phone_type_active_key" ON "registrations"("phone", "registrationType")
  WHERE "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');
CREATE UNIQUE INDEX "registrations_aadhaar_active_key" ON "registrations"("aadhaarNumber")
  WHERE "aadhaarNumber" IS NOT NULL AND "status" NOT IN ('PAYMENT_REJECTED', 'IDENTITY_REJECTED');

-- Payment.transactionId: was globally unique across all rows, which would block legitimate
-- UTR reuse in a resubmission after rejection. Replaced with a partial unique index scoped to
-- non-rejected payments; the application keeps a rejected registration's Payment.status in sync
-- (set to REJECTED) whenever the registration itself is rejected, so a rejected attempt's UTR
-- value stays on record for audit but no longer blocks reuse.
DROP INDEX "payments_transactionId_key";
CREATE INDEX "payments_transactionId_idx" ON "payments"("transactionId");
CREATE UNIQUE INDEX "payments_transaction_id_active_key" ON "payments"("transactionId")
  WHERE "transactionId" IS NOT NULL AND "status" != 'REJECTED';

-- Event: optional configurable gate-close time (entry window enforcement reads this,
-- falling back to the event date's own hardcoded default when unset)
ALTER TABLE "events" ADD COLUMN "gateClosesAt" TIMESTAMP(3);
