import type { PrismaClient } from "@prisma/client";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../../lib/qr/credential.js";
import { recordAuditLog } from "../audit/audit.service.js";
import { IDENTITY_REQUIRED_TYPES } from "./identity.service.js";
import type { Env } from "../../app/config/env.js";

export class WalkInRegistrationNotFoundError extends Error {}
export class WalkInAlreadyDecidedError extends Error {}
export class WalkInIdentityMissingError extends Error {}

// The /emg link is for people who already paid in the ERP but never finished registering --
// it skips payment proof and identity review entirely (no PaymentStep, no finance/identity
// queue), going straight from submitted details+uploads to an approved, QR-ready registration.
// It's a public, unauthenticated link (same trust model as /finaly and /my), not gated behind
// any login -- requestId/actor are therefore always unattributed here.
export async function completeWalkInRegistration(
  prisma: PrismaClient,
  env: Env,
  registrationId: string,
  requestId: string | null
): Promise<{ publicCode: string }> {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!registration) {
      throw new WalkInRegistrationNotFoundError();
    }
    if (registration.status !== "PAYMENT_PENDING" && registration.status !== "IDENTITY_PENDING") {
      throw new WalkInAlreadyDecidedError();
    }

    // No photo required for a walk-in registration -- filled in on the spot, nothing to collect.
    const needsIdentity = IDENTITY_REQUIRED_TYPES.includes(registration.registrationType);
    if (needsIdentity && !registration.collegeIdImageObjectKey && !registration.acharyanProofObjectKey) {
      throw new WalkInIdentityMissingError();
    }

    await tx.registration.update({
      where: { id: registration.id },
      data: {
        status: "PAYMENT_APPROVED",
        walkIn: true,
        walkInApprovedAt: new Date(),
        ...(needsIdentity ? { identityStatus: "APPROVED", identityVerifiedAt: new Date() } : {})
      }
    });

    // Walk-in registrations still get a Payment row (created alongside the registration, same as
    // every non-My-People type) -- mark it approved too so Payment-based admin views stay correct,
    // even though no proof/transaction ID was ever collected for it.
    await tx.payment.updateMany({
      where: { registrationId: registration.id },
      data: { status: "APPROVED", verifiedAt: new Date() }
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
      actorUserId: null,
      action: "WALK_IN_APPROVED",
      entityType: "Registration",
      entityId: registration.id,
      requestId
    });

    return { publicCode: registration.publicCode };
  });
}
