import type { Payment, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";
import type { Env } from "../../app/config/env.js";

export class PaymentNotFoundError extends Error {}
export class InvalidUploadIntentError extends Error {}
export class DuplicateTransactionIdError extends Error {}
export class PaymentNotSubmittableError extends Error {}
export class PaymentNotInReviewableStateError extends Error {}
export class IdentityNotApprovedError extends Error {}
export class PhotoRequiredError extends Error {}

export interface SubmitPaymentProofInput {
  registrationId: string;
  transactionId: string;
  proofObjectKey: string;
}

export async function submitPaymentProof(
  prisma: PrismaClient,
  input: SubmitPaymentProofInput
): Promise<Payment> {
  const payment = await prisma.payment.findUnique({ where: { registrationId: input.registrationId } });
  if (!payment) {
    throw new PaymentNotFoundError();
  }

  const intent = await prisma.uploadIntent.findUnique({ where: { objectKey: input.proofObjectKey } });
  if (
    !intent ||
    intent.registrationId !== input.registrationId ||
    intent.purpose !== "PAYMENT_PROOF" ||
    intent.consumedAt ||
    intent.expiresAt.getTime() < Date.now()
  ) {
    throw new InvalidUploadIntentError();
  }

  const registrationForPhotoCheck = await prisma.registration.findUniqueOrThrow({
    where: { id: input.registrationId }
  });
  if (!registrationForPhotoCheck.photoObjectKey) {
    throw new PhotoRequiredError();
  }
  if (
    registrationForPhotoCheck.registrationType === "NON_ACHARYAN_STUDENT" &&
    (!registrationForPhotoCheck.aadhaarImageObjectKey || !registrationForPhotoCheck.collegeIdImageObjectKey)
  ) {
    throw new PhotoRequiredError();
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const intentClaim = await tx.uploadIntent.updateMany({
        where: { id: intent.id, consumedAt: null },
        data: { consumedAt: new Date() }
      });
      if (intentClaim.count !== 1) {
        throw new InvalidUploadIntentError();
      }

      const paymentUpdate = await tx.payment.updateMany({
        where: { registrationId: input.registrationId, status: { not: "APPROVED" } },
        data: {
          transactionId: input.transactionId,
          proofObjectKey: input.proofObjectKey,
          status: "PROOF_SUBMITTED",
          submittedAt: new Date(),
          rejectionReason: null
        }
      });
      if (paymentUpdate.count !== 1) {
        throw new PaymentNotSubmittableError();
      }

      const updated = await tx.payment.findUniqueOrThrow({
        where: { registrationId: input.registrationId }
      });

      const registrationBefore = await tx.registration.findUniqueOrThrow({
        where: { id: input.registrationId }
      });

      await tx.registration.update({
        where: { id: input.registrationId },
        data: {
          status:
            registrationBefore.registrationType === "NON_ACHARYAN_STUDENT"
              ? "IDENTITY_PENDING"
              : "PAYMENT_SUBMITTED"
        }
      });

      return updated;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DuplicateTransactionIdError();
    }
    throw error;
  }
}

export async function approvePayment(
  prisma: PrismaClient,
  env: Env,
  paymentId: string,
  verifiedByUserId: string,
  requestId: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const pending = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { registration: true }
    });
    if (
      pending?.registration.registrationType === "NON_ACHARYAN_STUDENT" &&
      pending.registration.identityStatus !== "APPROVED"
    ) {
      throw new IdentityNotApprovedError();
    }

    const result = await tx.payment.updateMany({
      where: { id: paymentId, status: "PROOF_SUBMITTED" },
      data: { status: "APPROVED", verifiedById: verifiedByUserId, verifiedAt: new Date() }
    });

    if (result.count !== 1) {
      throw new PaymentNotInReviewableStateError();
    }

    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

    await tx.registration.update({
      where: { id: payment.registrationId },
      data: { status: "PAYMENT_APPROVED" }
    });

    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: payment.registrationId }
    });

    const credentialId = newCredentialId();
    const signedToken = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
    await tx.passCredential.upsert({
      where: { registrationId: registration.id },
      update: {},
      create: {
        id: credentialId,
        registrationId: registration.id,
        credentialType: "PARTICIPANT",
        opaqueTokenHash: hashCredentialToken(signedToken),
        active: true
      }
    });

    await tx.emailJob.upsert({
      where: { uniquenessKey: `payment-approved-${registration.id}` },
      update: {},
      create: {
        type: "PAYMENT_APPROVED",
        recipient: registration.email,
        registrationId: registration.id,
        payloadJson: { publicCode: registration.publicCode, name: registration.name },
        uniquenessKey: `payment-approved-${registration.id}`
      }
    });

    await recordAuditLog(tx, {
      actorUserId: verifiedByUserId,
      action: "PAYMENT_APPROVED",
      entityType: "Payment",
      entityId: paymentId,
      requestId
    });
  });
}

export async function rejectPayment(
  prisma: PrismaClient,
  paymentId: string,
  verifiedByUserId: string,
  reasonText: string,
  requestId: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const pending = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { registration: true }
    });
    if (
      pending?.registration.registrationType === "NON_ACHARYAN_STUDENT" &&
      pending.registration.identityStatus !== "APPROVED"
    ) {
      throw new IdentityNotApprovedError();
    }

    const result = await tx.payment.updateMany({
      where: { id: paymentId, status: "PROOF_SUBMITTED" },
      data: {
        status: "REJECTED",
        rejectionReason: reasonText,
        verifiedById: verifiedByUserId,
        verifiedAt: new Date()
      }
    });

    if (result.count !== 1) {
      throw new PaymentNotInReviewableStateError();
    }

    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });

    await tx.registration.update({
      where: { id: payment.registrationId },
      data: { status: "PAYMENT_REJECTED" }
    });

    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: payment.registrationId }
    });

    await tx.emailJob.create({
      data: {
        type: "PAYMENT_REJECTED",
        recipient: registration.email,
        registrationId: registration.id,
        payloadJson: { publicCode: registration.publicCode, name: registration.name, reason: reasonText },
        uniquenessKey: `payment-rejected-${paymentId}-${Date.now()}`
      }
    });

    await recordAuditLog(tx, {
      actorUserId: verifiedByUserId,
      action: "PAYMENT_REJECTED",
      entityType: "Payment",
      entityId: paymentId,
      metadata: { reason: reasonText },
      requestId
    });
  });
}
