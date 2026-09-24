-- Alumni identity flow simplification (single generic "Acharyan proof" document instead of an
-- Aadhaar/College-ID choice) + a dedicated ID_VERIFIER staff role for the new standalone identity
-- verification panel. Purely additive — no columns/tables/rows are dropped.

ALTER TYPE "UserRole" ADD VALUE 'ID_VERIFIER';
ALTER TYPE "IdentityDocumentType" ADD VALUE 'ACHARYAN_PROOF';
ALTER TYPE "UploadPurpose" ADD VALUE 'ACHARYAN_PROOF';

ALTER TABLE "registrations" ADD COLUMN "acharyanProofObjectKey" TEXT;
