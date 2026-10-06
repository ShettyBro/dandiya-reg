import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";

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
  "Registered At"
] as const;

// Only PAYMENT_APPROVED registrations belong here — that's the exact set of people who received
// the confirmation email with their QR pass, i.e. genuinely valid/verified registrations. Anything
// still pending payment or identity review is deliberately excluded.
export async function buildVerifiedRegistrationsWorkbook(prisma: PrismaClient): Promise<Buffer> {
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
      createdAt: true,
      payment: { select: { amountInPaise: true, transactionId: true, verifiedAt: true } },
      attendance: { select: { collegeGateState: true, eventGateState: true } }
    }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Verified Registrations");

  sheet.columns = HEADERS.map((header) => ({
    header,
    width: header === "Email" ? 28 : 18
  }));
  sheet.getRow(1).font = { bold: true };

  for (const reg of registrations) {
    sheet.addRow([
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
      new Date(reg.createdAt).toLocaleString("en-IN")
    ]);
  }

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written as unknown as ArrayBuffer);
}
