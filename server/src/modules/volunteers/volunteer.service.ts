import { randomBytes } from "node:crypto";
import type { PrismaClient, UserRole } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { hashPassword } from "../../lib/security/password.js";
import { deriveSignedCredentialToken, hashCredentialToken, newCredentialId } from "../../lib/qr/credential.js";
import { generateStaffPublicCode } from "../../lib/security/codes.js";
import type { Env } from "../../app/config/env.js";

export class VolunteerNotFoundError extends Error {}

const STAFF_CODE_MAX_ATTEMPTS = 5;

function portalUrl(env: Env): string {
  return `${env.FRONTEND_ORIGIN}/vol/login`;
}

async function createStaffCredential(
  tx: Prisma.TransactionClient,
  env: Env,
  label: string
): Promise<string> {
  for (let attempt = 0; attempt < STAFF_CODE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const credentialId = newCredentialId();
      const token = deriveSignedCredentialToken(env.QR_SECRET, credentialId);
      const credential = await tx.passCredential.create({
        data: {
          id: credentialId,
          credentialType: "STAFF_GUEST_ADMIN",
          opaqueTokenHash: hashCredentialToken(token),
          active: true,
          label,
          publicCode: generateStaffPublicCode()
        }
      });
      return credential.id;
    } catch (error) {
      const isUniqueClash =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueClash || attempt === STAFF_CODE_MAX_ATTEMPTS - 1) {
        throw error;
      }
    }
  }
  throw new Error("Could not generate a unique staff credential code");
}

export interface CreateVolunteerInput {
  name: string;
  email: string;
  phone: string;
  role: Extract<UserRole, "VOLUNTEER" | "TEAM_LEADER">;
  gate?: string | undefined;
  zone?: string | undefined;
  shiftStart?: Date | undefined;
  shiftEnd?: Date | undefined;
}

export interface CreatedVolunteer {
  userId: string;
  email: string;
  temporaryPassword: string;
}

export async function createVolunteer(
  prisma: PrismaClient,
  env: Env,
  input: CreateVolunteerInput
): Promise<CreatedVolunteer> {
  const temporaryPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { email: input.email, passwordHash, role: input.role, status: "ACTIVE" }
    });

    const staffCredentialId = await createStaffCredential(tx, env, input.name);

    await tx.volunteerProfile.create({
      data: {
        userId: createdUser.id,
        name: input.name,
        phone: input.phone,
        gate: input.gate ?? null,
        zone: input.zone ?? null,
        shiftStart: input.shiftStart ?? null,
        shiftEnd: input.shiftEnd ?? null,
        mustChangePassword: true,
        staffCredentialId
      }
    });

    await tx.emailJob.create({
      data: {
        type: "VOLUNTEER_INVITE",
        recipient: input.email,
        payloadJson: { name: input.name, portalUrl: portalUrl(env) },
        uniquenessKey: `volunteer-invite-${createdUser.id}`
      }
    });

    return createdUser;
  });

  return { userId: user.id, email: user.email, temporaryPassword };
}

export async function resetVolunteerPassword(
  prisma: PrismaClient,
  env: Env,
  userId: string
): Promise<CreatedVolunteer> {
  const temporaryPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: userId }, include: { volunteerProfile: true } });
    if (!existing) {
      throw new VolunteerNotFoundError();
    }

    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.volunteerProfile.updateMany({
      where: { userId },
      data: { mustChangePassword: true }
    });

    await tx.emailJob.create({
      data: {
        type: "PASSWORD_RESET",
        recipient: existing.email,
        payloadJson: { name: existing.volunteerProfile?.name ?? "there", portalUrl: portalUrl(env) },
        uniquenessKey: `volunteer-password-reset-${userId}-${Date.now()}`
      }
    });

    return existing;
  });

  return { userId: user.id, email: user.email, temporaryPassword };
}

export interface UpdateVolunteerInput {
  role?: Extract<UserRole, "VOLUNTEER" | "TEAM_LEADER"> | undefined;
  status?: "ACTIVE" | "DISABLED" | undefined;
  gate?: string | null | undefined;
  zone?: string | null | undefined;
  shiftStart?: Date | null | undefined;
  shiftEnd?: Date | null | undefined;
}

export async function updateVolunteer(
  prisma: PrismaClient,
  userId: string,
  input: UpdateVolunteerInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (input.role || input.status) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(input.role ? { role: input.role } : {}),
          ...(input.status ? { status: input.status } : {})
        }
      });
    }

    const profileUpdate: Record<string, unknown> = {};
    if (input.gate !== undefined) profileUpdate.gate = input.gate;
    if (input.zone !== undefined) profileUpdate.zone = input.zone;
    if (input.shiftStart !== undefined) profileUpdate.shiftStart = input.shiftStart;
    if (input.shiftEnd !== undefined) profileUpdate.shiftEnd = input.shiftEnd;

    if (Object.keys(profileUpdate).length > 0) {
      await tx.volunteerProfile.update({ where: { userId }, data: profileUpdate });
    }

    if (input.status) {
      const profile = await tx.volunteerProfile.findUnique({ where: { userId } });
      if (profile?.staffCredentialId) {
        await tx.passCredential.update({
          where: { id: profile.staffCredentialId },
          data:
            input.status === "DISABLED"
              ? { active: false, revokedAt: new Date() }
              : { active: true, revokedAt: null }
        });
      }
    }
  });
}
