-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'FINANCE', 'VOLUNTEER', 'TEAM_LEADER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('SUBMITTED', 'PAYMENT_PENDING', 'PAYMENT_SUBMITTED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROOF_SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('PARTICIPANT_PHOTO', 'PAYMENT_PROOF');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PARTICIPANT', 'STAFF_GUEST_ADMIN');

-- CreateEnum
CREATE TYPE "AttendanceState" AS ENUM ('NOT_ENTERED', 'ENTERED', 'OVERRIDE_ENTRY');

-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'RETRY', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailTemplateKey" AS ENUM ('REGISTRATION_RECEIVED', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'VOLUNTEER_INVITE', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "venue" TEXT NOT NULL,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "registrationDeadline" TIMESTAMP(3),
    "capacity" INTEGER NOT NULL,
    "priceInPaise" INTEGER NOT NULL,
    "erpPaymentUrl" TEXT NOT NULL,
    "paymentInstructions" TEXT NOT NULL,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "paymentsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_profiles" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "gate" TEXT,
    "zone" TEXT,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "staffCredentialId" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "publicCode" TEXT NOT NULL,
    "eightDigitCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "college" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "photoObjectKey" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upload_intents" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "expectedMime" TEXT NOT NULL,
    "maxSizeBytes" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amountInPaise" INTEGER NOT NULL,
    "proofObjectKey" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pass_credentials" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT,
    "credentialType" "CredentialType" NOT NULL,
    "opaqueTokenHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pass_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "state" "AttendanceState" NOT NULL DEFAULT 'NOT_ENTERED',
    "entryCount" INTEGER NOT NULL DEFAULT 0,
    "firstEntryAt" TIMESTAMP(3),
    "lastEntryAt" TIMESTAMP(3),
    "lastScannerUserId" TEXT,
    "lastGate" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_overrides" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "teamLeaderUserId" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "originalState" "AttendanceState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" TEXT NOT NULL,
    "type" "EmailTemplateKey" NOT NULL,
    "recipient" TEXT NOT NULL,
    "registrationId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "uniquenessKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_profiles_staffCredentialId_key" ON "volunteer_profiles"("staffCredentialId");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_publicCode_key" ON "registrations"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_eightDigitCode_key" ON "registrations"("eightDigitCode");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_idempotencyKey_key" ON "registrations"("idempotencyKey");

-- CreateIndex
CREATE INDEX "registrations_email_idx" ON "registrations"("email");

-- CreateIndex
CREATE INDEX "registrations_phone_idx" ON "registrations"("phone");

-- CreateIndex
CREATE INDEX "registrations_status_idx" ON "registrations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "upload_intents_objectKey_key" ON "upload_intents"("objectKey");

-- CreateIndex
CREATE INDEX "upload_intents_registrationId_purpose_idx" ON "upload_intents"("registrationId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "payments_registrationId_key" ON "payments"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");

-- CreateIndex
CREATE INDEX "payments_status_submittedAt_idx" ON "payments"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pass_credentials_registrationId_key" ON "pass_credentials"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "pass_credentials_opaqueTokenHash_key" ON "pass_credentials"("opaqueTokenHash");

-- CreateIndex
CREATE INDEX "pass_credentials_credentialType_active_idx" ON "pass_credentials"("credentialType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_registrationId_key" ON "attendance"("registrationId");

-- CreateIndex
CREATE INDEX "attendance_state_idx" ON "attendance"("state");

-- CreateIndex
CREATE INDEX "attendance_overrides_registrationId_idx" ON "attendance_overrides"("registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_uniquenessKey_key" ON "email_jobs"("uniquenessKey");

-- CreateIndex
CREATE INDEX "email_jobs_status_nextAttemptAt_idx" ON "email_jobs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- AddForeignKey
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_staffCredentialId_fkey" FOREIGN KEY ("staffCredentialId") REFERENCES "pass_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_credentials" ADD CONSTRAINT "pass_credentials_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_lastScannerUserId_fkey" FOREIGN KEY ("lastScannerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overrides" ADD CONSTRAINT "attendance_overrides_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_overrides" ADD CONSTRAINT "attendance_overrides_teamLeaderUserId_fkey" FOREIGN KEY ("teamLeaderUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "registrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
