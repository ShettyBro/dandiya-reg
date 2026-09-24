-- Acharya Alumni registration type + identity-document choice + dual-gate attendance + volunteer gate
-- assignment. Purely additive: no columns/tables/rows are dropped, so all existing registration,
-- payment, attendance, and audit history is preserved untouched.

-- New registration type
ALTER TYPE "RegistrationType" ADD VALUE 'ACHARYA_ALUMNI';

-- Which single identity document a registration proves with (Non-Acharyan Student and Acharya Alumni)
CREATE TYPE "IdentityDocumentType" AS ENUM ('AADHAAR', 'COLLEGE_ID');
ALTER TABLE "registrations" ADD COLUMN "identityDocumentType" "IdentityDocumentType";

-- Gate enum shared by volunteer gate assignment, attendance dual-gate state, and overrides
CREATE TYPE "Gate" AS ENUM ('COLLEGE_GATE', 'EVENT_GATE');

-- Volunteer gate assignment (nullable until admin sets it)
ALTER TABLE "volunteer_profiles" ADD COLUMN "assignedGate" "Gate";

-- Dual-gate attendance state, additive alongside the existing single-gate columns (left untouched)
ALTER TABLE "attendance" ADD COLUMN "collegeGateState" "AttendanceState" NOT NULL DEFAULT 'NOT_ENTERED';
ALTER TABLE "attendance" ADD COLUMN "collegeGateEntryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance" ADD COLUMN "collegeGateFirstEntryAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN "collegeGateLastEntryAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN "collegeGateLastScannerUserId" TEXT;
ALTER TABLE "attendance" ADD COLUMN "eventGateState" "AttendanceState" NOT NULL DEFAULT 'NOT_ENTERED';
ALTER TABLE "attendance" ADD COLUMN "eventGateEntryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance" ADD COLUMN "eventGateFirstEntryAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN "eventGateLastEntryAt" TIMESTAMP(3);
ALTER TABLE "attendance" ADD COLUMN "eventGateLastScannerUserId" TEXT;

ALTER TABLE "attendance" ADD CONSTRAINT "attendance_collegeGateLastScannerUserId_fkey"
  FOREIGN KEY ("collegeGateLastScannerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_eventGateLastScannerUserId_fkey"
  FOREIGN KEY ("eventGateLastScannerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "attendance_collegeGateState_idx" ON "attendance"("collegeGateState");
CREATE INDEX "attendance_eventGateState_idx" ON "attendance"("eventGateState");

-- Gate-aware override audit trail (table confirmed empty in production, safe to add NOT NULL directly)
ALTER TABLE "attendance_overrides" ADD COLUMN "gate" "Gate" NOT NULL;
CREATE INDEX "attendance_overrides_gate_idx" ON "attendance_overrides"("gate");
