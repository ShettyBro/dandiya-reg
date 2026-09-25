import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { getR2Client, R2NotConfiguredError } from "../../lib/r2/client.js";
import { getObjectBytes } from "../../lib/r2/presign.js";
import type { Env } from "../../app/config/env.js";

const TYPE_LABELS: Record<string, string> = {
  ACHARYA_STUDENT: "Acharya Student",
  ACHARYA_FACULTY: "Acharya Faculty",
  ACHARYA_ALUMNI: "Acharya Alumni",
  NON_ACHARYAN_STUDENT: "Non-Acharyan Student"
};

const HEADERS = [
  "Public Code",
  "8-Digit Code",
  "Registration Type",
  "Name",
  "Email",
  "Phone",
  "Institution",
  "College Name",
  "AUID",
  "Employee ID",
  "Year",
  "Amount Paid",
  "Transaction ID",
  "Payment Approved At",
  "College Gate",
  "Event Gate",
  "Registered At",
  "Photo"
] as const;

const PHOTO_COLUMN_INDEX = HEADERS.length; // 1-indexed, last column
const ROW_HEIGHT = 90;
const IMAGE_SIZE = 110;

function extensionForKey(key: string): "jpeg" | "png" | null {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  return null;
}

// Only PAYMENT_APPROVED registrations belong here — that's the exact set of people who received
// the confirmation email with their QR pass, i.e. genuinely valid/verified registrations. Anything
// still pending payment or identity review is deliberately excluded.
export async function buildVerifiedRegistrationsWorkbook(prisma: PrismaClient, env: Env): Promise<Buffer> {
  const registrations = await prisma.registration.findMany({
    where: { payment: { status: "APPROVED" } },
    orderBy: { createdAt: "asc" },
    select: {
      registrationType: true,
      publicCode: true,
      eightDigitCode: true,
      name: true,
      email: true,
      phone: true,
      institution: true,
      collegeName: true,
      auid: true,
      employeeId: true,
      year: true,
      photoObjectKey: true,
      createdAt: true,
      payment: { select: { amountInPaise: true, transactionId: true, verifiedAt: true } },
      attendance: { select: { collegeGateState: true, eventGateState: true } }
    }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Verified Registrations");

  sheet.columns = HEADERS.map((header) => ({
    header,
    width: header === "Photo" ? 18 : header === "Email" ? 28 : 18
  }));
  sheet.getRow(1).font = { bold: true };

  let client;
  try {
    client = getR2Client(env);
  } catch (error) {
    if (!(error instanceof R2NotConfiguredError)) throw error;
    client = null;
  }

  for (const reg of registrations) {
    const row = sheet.addRow([
      reg.publicCode,
      reg.eightDigitCode,
      TYPE_LABELS[reg.registrationType] ?? reg.registrationType,
      reg.name,
      reg.email,
      reg.phone,
      reg.institution ?? "",
      reg.collegeName ?? "",
      reg.auid ?? "",
      reg.employeeId ?? "",
      reg.year ?? "",
      reg.payment ? (reg.payment.amountInPaise / 100).toFixed(2) : "",
      reg.payment?.transactionId ?? "",
      reg.payment?.verifiedAt ? new Date(reg.payment.verifiedAt).toLocaleString("en-IN") : "",
      reg.attendance?.collegeGateState.replaceAll("_", " ") ?? "NOT ENTERED",
      reg.attendance?.eventGateState.replaceAll("_", " ") ?? "NOT ENTERED",
      new Date(reg.createdAt).toLocaleString("en-IN"),
      ""
    ]);
    row.height = ROW_HEIGHT;

    if (client && reg.photoObjectKey) {
      const extension = extensionForKey(reg.photoObjectKey);
      if (extension) {
        try {
          const bytes = await getObjectBytes(client, env.R2_BUCKET_NAME, reg.photoObjectKey);
          // exceljs ships its own ambient Buffer type that doesn't structurally match the
          // generic Buffer<ArrayBufferLike> from a newer @types/node — harmless interop cast.
          const imageId = workbook.addImage({ buffer: bytes as never, extension });
          sheet.addImage(imageId, {
            tl: { col: PHOTO_COLUMN_INDEX - 1, row: row.number - 1 },
            ext: { width: IMAGE_SIZE, height: IMAGE_SIZE }
          });
        } catch (error) {
          console.error(
            `export: failed to embed photo for ${reg.publicCode}:`,
            error instanceof Error ? error.message : "unknown error"
          );
        }
      }
    }
  }

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written as unknown as ArrayBuffer);
}
