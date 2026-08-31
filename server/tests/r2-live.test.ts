import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createApp } from "../src/app/create-app.js";
import { loadEnv, resetEnvCacheForTests } from "../src/app/config/env.js";
import { getR2Client } from "../src/lib/r2/client.js";
import { submitPaymentProof } from "../src/modules/payments/payment.service.js";

const prisma = new PrismaClient();

resetEnvCacheForTests();
const env = loadEnv(process.env);
const app = createApp(env, prisma);
const r2 = getR2Client(env);

const createdRegistrationIds: string[] = [];
const createdObjectKeys: string[] = [];

async function createTestRegistration(suffix: string) {
  const response = await request(app)
    .post("/api/v1/registrations")
    .set("Idempotency-Key", `r2-live-${suffix}-${Date.now()}`)
    .send({
      name: "R2 Live Test User",
      phone: "9123456780",
      email: `r2-live-${suffix}@acharya.ac.in`,
      college: "Acharya Institute",
      semester: "5",
      branch: "CSE"
    });
  createdRegistrationIds.push(response.body.registrationId);
  return response.body as { registrationId: string };
}

async function presignAndUpload(
  registrationId: string,
  purpose: "PARTICIPANT_PHOTO" | "PAYMENT_PROOF",
  contentType: string,
  bytes: Buffer
) {
  const presignResponse = await request(app)
    .post("/api/v1/uploads/presign")
    .send({ registrationId, purpose, contentType });

  expect(presignResponse.status).toBe(200);
  const { uploadUrl, objectKey } = presignResponse.body as { uploadUrl: string; objectKey: string };
  createdObjectKeys.push(objectKey);

  const putResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes
  });
  expect(putResponse.status).toBe(200);

  return objectKey;
}

afterAll(async () => {
  for (const key of createdObjectKeys) {
    await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })).catch(() => undefined);
  }
  await prisma.attendance.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.payment.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.uploadIntent.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.emailJob.deleteMany({ where: { registrationId: { in: createdRegistrationIds } } });
  await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
  await prisma.$disconnect();
});

describe("live R2 upload flow", () => {
  it("accepts a real square photo and binds it to the registration", async () => {
    const registration = await createTestRegistration("photo-ok");
    const squareImage = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 100, g: 50, b: 150 } }
    })
      .jpeg()
      .toBuffer();

    const objectKey = await presignAndUpload(
      registration.registrationId,
      "PARTICIPANT_PHOTO",
      "image/jpeg",
      squareImage
    );

    const bindResponse = await request(app)
      .patch(`/api/v1/registrations/${registration.registrationId}/photo`)
      .send({ objectKey });

    expect(bindResponse.status).toBe(200);

    const dbRegistration = await prisma.registration.findUniqueOrThrow({
      where: { id: registration.registrationId }
    });
    expect(dbRegistration.photoObjectKey).toBe(objectKey);
  });

  it("rejects a non-square photo for the aspect-ratio requirement", async () => {
    const registration = await createTestRegistration("photo-nonsquare");
    const wideImage = await sharp({
      create: { width: 800, height: 300, channels: 3, background: { r: 20, g: 20, b: 20 } }
    })
      .jpeg()
      .toBuffer();

    const objectKey = await presignAndUpload(
      registration.registrationId,
      "PARTICIPANT_PHOTO",
      "image/jpeg",
      wideImage
    );

    const bindResponse = await request(app)
      .patch(`/api/v1/registrations/${registration.registrationId}/photo`)
      .send({ objectKey });

    expect(bindResponse.status).toBe(422);
    expect(bindResponse.body.code).toBe("IMAGE_VALIDATION_FAILED");
  });

  it("rejects a spoofed content type where the bytes are not actually a decodable image", async () => {
    const registration = await createTestRegistration("photo-spoofed");
    const notAnImage = Buffer.from("this is definitely not an image, just plain text bytes");

    const objectKey = await presignAndUpload(
      registration.registrationId,
      "PARTICIPANT_PHOTO",
      "image/jpeg",
      notAnImage
    );

    const bindResponse = await request(app)
      .patch(`/api/v1/registrations/${registration.registrationId}/photo`)
      .send({ objectKey });

    expect(bindResponse.status).toBe(422);
    expect(bindResponse.body.code).toBe("IMAGE_VALIDATION_FAILED");
  });

  it("rejects an oversized upload", async () => {
    const registration = await createTestRegistration("photo-oversized");
    const bigImage = await sharp({
      create: { width: 4000, height: 4000, channels: 3, background: { r: 200, g: 200, b: 200 } }
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(bigImage.byteLength).toBeGreaterThan(2 * 1024 * 1024);

    const objectKey = await presignAndUpload(
      registration.registrationId,
      "PARTICIPANT_PHOTO",
      "image/png",
      bigImage
    );

    const bindResponse = await request(app)
      .patch(`/api/v1/registrations/${registration.registrationId}/photo`)
      .send({ objectKey });

    expect(bindResponse.status).toBe(422);
    expect(bindResponse.body.code).toBe("IMAGE_VALIDATION_FAILED");
  });

  it("accepts a real payment proof screenshot and retrieves it through a live signed GET URL", async () => {
    const registration = await createTestRegistration("proof-ok");
    const proofImage = await sharp({
      create: { width: 600, height: 900, channels: 3, background: { r: 10, g: 80, b: 60 } }
    })
      .png()
      .toBuffer();

    const objectKey = await presignAndUpload(
      registration.registrationId,
      "PAYMENT_PROOF",
      "image/png",
      proofImage
    );

    const payment = await submitPaymentProof(prisma, {
      registrationId: registration.registrationId,
      transactionId: `TXN-R2LIVE-${Date.now()}`,
      proofObjectKey: objectKey
    });
    expect(payment.status).toBe("PROOF_SUBMITTED");

    const financeEmail = `r2-live-finance-${Date.now()}@acharya.ac.in`;
    const { hashPassword } = await import("../src/lib/security/password.js");
    const passwordHash = await hashPassword("correct horse battery staple");
    const finance = await prisma.user.create({
      data: { email: financeEmail, passwordHash, role: "FINANCE", status: "ACTIVE" }
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: financeEmail, password: "correct horse battery staple" });
    const cookies = login.headers["set-cookie"] as unknown as string[];

    const proofUrlResponse = await request(app)
      .get(`/api/v1/admin/payments/${payment.id}/proof-url`)
      .set("Cookie", cookies);

    expect(proofUrlResponse.status).toBe(200);

    const fetchResponse = await fetch(proofUrlResponse.body.url as string);
    expect(fetchResponse.status).toBe(200);
    const fetchedBytes = Buffer.from(await fetchResponse.arrayBuffer());
    expect(fetchedBytes.byteLength).toBe(proofImage.byteLength);

    await prisma.refreshToken.deleteMany({ where: { userId: finance.id } });
    await prisma.user.delete({ where: { id: finance.id } });
  });
});
