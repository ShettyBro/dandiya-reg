import type { PrismaClient, RegistrationType } from "@prisma/client";
import { recordAuditLog } from "../audit/audit.service.js";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { headObject, ObjectNotFoundError } from "../../lib/r2/presign.js";
import type { Env } from "../../app/config/env.js";

export class IdentityNotReviewableError extends Error {}
// The registration's DB field pointing at the identity-proof object is non-null, but the actual
// object is gone from R2 (a prior storage incident is exactly the scenario this guards against) —
// approval must never proceed as if the document had been reviewed when it can't actually be seen.
export class DocumentMissingError extends Error {}

// Registration types that go through manual identity-document review before payment can be
// approved/rejected: Non-Acharyan Student (College ID only) and Acharya Alumni (Aadhaar or College ID).
export const IDENTITY_REQUIRED_TYPES: RegistrationType[] = ["NON_ACHARYAN_STUDENT", "ACHARYA_ALUMNI"];

async function assertDocumentExists(env: Env, objectKey: string | null): Promise<void> {
  if (!objectKey) {
    throw new DocumentMissingError();
  }
  const client = getR2Client(env);
  try {
    await headObject(client, env.R2_BUCKET_NAME, objectKey);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      throw new DocumentMissingError();
    }
    throw error;
  }
}

export async function approveIdentity(
  prisma: PrismaClient,
  env: Env,
  registrationId: string,
  verifiedByUserId: string,
  requestId: string | null
): Promise<void> {
  const registration = await prisma.registration.findUnique({ where: { id: registrationId } });
  if (!registration || registration.status !== "IDENTITY_PENDING") {
    throw new IdentityNotReviewableError();
  }

  try {
    await assertDocumentExists(env, registration.collegeIdImageObjectKey ?? registration.acharyanProofObjectKey);
  } catch (error) {
    if (error instanceof R2NotConfiguredError) {
      // Storage isn't configured at all in this environment (e.g. local dev without R2 creds) —
      // don't block approval on an infrastructure gap that isn't the document's fault.
    } else {
      throw error;
    }
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.registration.updateMany({
      where: { id: registrationId, registrationType: { in: IDENTITY_REQUIRED_TYPES }, status: "IDENTITY_PENDING" },
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
      where: { id: registrationId, registrationType: { in: IDENTITY_REQUIRED_TYPES }, status: "IDENTITY_PENDING" },
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
