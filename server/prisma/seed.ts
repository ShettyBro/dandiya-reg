import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const eventId = process.env.EVENT_ID;
  if (!eventId) {
    throw new Error("EVENT_ID must be set before seeding");
  }

  const event = await prisma.event.upsert({
    where: { id: eventId },
    update: {},
    create: {
      id: eventId,
      name: "Dandiya Night 2026",
      eventDate: new Date("2026-10-15T09:30:00.000Z"),
      gateClosesAt: new Date("2026-10-15T11:30:00.000Z"),
      venue: "Acharya Stadium",
      registrationOpen: true,
      capacity: 3000,
      priceInPaise: 15100,
      erpPaymentUrl: process.env.ERP_PAYMENT_URL ?? "https://www.acharyaerptech.in/ExternalPayment/370",
      paymentInstructions:
        "Pay the event fee (₹151) through the college ERP, then return here with the transaction ID and a screenshot."
    }
  });

  console.log(`Event ready: ${event.id} (${event.name})`);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@acharya.ac.in";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (existingAdmin) {
    console.log(`Admin user already exists: ${adminEmail}`);
    return;
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });

  await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE"
    }
  });

  console.log(`Admin user created: ${adminEmail}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated admin password (save this now, it will not be shown again): ${adminPassword}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
