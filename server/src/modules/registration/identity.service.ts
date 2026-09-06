import type { PrismaClient } from "@prisma/client";
import { recordAuditLog } from "../audit/audit.service.js";

export class IdentityNotReviewableError extends Error {}

export async function approveIdentity(
  prisma: PrismaClient,
  registrationId: string,
  verifiedByUserId: string,
  requestId: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.registration.updateMany({
      where: { id: registrationId, registrationType: "NON_ACHARYAN_STUDENT", status: "IDENTITY_PENDING" },
      data: {
        identityStatus: "APPROVED",
        identityVerifiedById: verifiedByUserId,
        identityVerifiedAt: new Date(),
        status: "PAYMENT_SUBMITTED"
      }
    });

    if (result.count !== 1) {
      throw new IdentityNotReviewableError();
    }

    await recordAuditLog(tx, {
      actorUserId: verifiedByUserId,
      action: "IDENTITY_APPROVED",
      entityType: "Registration",
      entityId: registrationId,
      requestId
    });
  });
}

export async function rejectIdentity(
  prisma: PrismaClient,
  registrationId: string,
  verifiedByUserId: string,
  reasonText: string,
  requestId: string | null
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.registration.updateMany({
      where: { id: registrationId, registrationType: "NON_ACHARYAN_STUDENT", status: "IDENTITY_PENDING" },
      data: {
        identityStatus: "REJECTED",
        identityRejectionReason: reasonText,
        identityVerifiedById: verifiedByUserId,
        identityVerifiedAt: new Date(),
        status: "IDENTITY_REJECTED"
      }
    });

    if (result.count !== 1) {
      throw new IdentityNotReviewableError();
    }

    // Release the payment reference/UTR for reuse on resubmission — the person does not need
    // to pay again, but the old Payment row must stop counting toward UTR uniqueness.
    await tx.payment.updateMany({
      where: { registrationId, status: { not: "APPROVED" } },
      data: { status: "REJECTED" }
    });

    const registration = await tx.registration.findUniqueOrThrow({ where: { id: registrationId } });

    await tx.emailJob.create({
      data: {
        type: "IDENTITY_REJECTED",
        recipient: registration.email,
        registrationId: registration.id,
        payloadJson: { publicCode: registration.publicCode, name: registration.name, reason: reasonText },
        uniquenessKey: `identity-rejected-${registrationId}-${Date.now()}`
      }
    });

    await recordAuditLog(tx, {
      actorUserId: verifiedByUserId,
      action: "IDENTITY_REJECTED",
      entityType: "Registration",
      entityId: registrationId,
      metadata: { reason: reasonText },
      requestId
    });
  });
}
