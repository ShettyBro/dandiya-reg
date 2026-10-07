import PDFDocument from "pdfkit";

const GOLD = "#e8b84b";
const BG = "#05060d";
const CARD_BG = "#11142a";
const TEXT = "#f4f4f8";
const MUTED = "#9a9db4";

const DOS = [
  "Be on time and plan your day to avoid a last-minute rush.",
  "Carry your College ID Card and this QR code for entry checking.",
  "Wear ethnic/traditional attire compulsorily — kurta, lehenga, saree, chaniya choli, etc.",
  "Cooperate with security personnel, police officials, and event volunteers."
];

const DONTS = [
  "No bags, cosmetics, keychains, sharp objects, watches, or metal accessories.",
  "No water bottles, liquids, food, or edible items inside the venue.",
  "No cloakroom facility is provided — do not carry valuables.",
  "No entry under the influence of alcohol or intoxicating substances.",
  "Entry is one-time only — once you exit, you cannot re-enter."
];

export interface QrDownloadPdfInput {
  name: string;
  publicCode: string;
  qrPngBuffer: Buffer;
  logoImageBuffer: Buffer | null;
  backgroundImageBuffer: Buffer | null;
}

export async function buildQrDownloadPdf(input: QrDownloadPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 36, bottom: 36, left: 40, right: 40 } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;

  // Base background, then a large, very faint brand flourish behind everything else so the page
  // reads as deliberately designed rather than a mostly-empty document with text on it.
  doc.rect(0, 0, pageWidth, pageHeight).fill(BG);
  if (input.backgroundImageBuffer) {
    const flourishHeight = pageHeight * 0.55;
    doc.opacity(0.05);
    doc.image(input.backgroundImageBuffer, 0, pageHeight - flourishHeight, {
      width: pageWidth,
      height: flourishHeight,
      cover: [pageWidth, flourishHeight],
      align: "center",
      valign: "bottom"
    });
    doc.opacity(1);
  }

  if (input.logoImageBuffer) {
    const logoBoxWidth = 90;
    const logoBoxHeight = 38;
    doc.image(input.logoImageBuffer, (pageWidth - logoBoxWidth) / 2, doc.y, {
      fit: [logoBoxWidth, logoBoxHeight],
      align: "center",
      valign: "center"
    });
    doc.y += logoBoxHeight + 8;
  }

  doc.fillColor(GOLD).font("Helvetica").fontSize(10).text("DANDIYA NIGHT", { align: "center", characterSpacing: 2 });
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(26).text("2026", { align: "center" });
  doc.moveDown(0.35);

  const dividerWidth = 70;
  const dividerY = doc.y;
  doc
    .moveTo((pageWidth - dividerWidth) / 2, dividerY)
    .lineTo((pageWidth + dividerWidth) / 2, dividerY)
    .lineWidth(1)
    .strokeColor(GOLD)
    .stroke();
  doc.y = dividerY + 14;

  const displayName = input.name.replace(/\b\w/g, (c) => c.toUpperCase());

  // --- ID-card style panel -------------------------------------------------
  const cardTop = doc.y;
  const padTop = 24;
  const padBottom = 18;
  const qrSize = 160;
  const cardHeight = padTop + 20 /* name */ + 10 + 11 /* label */ + 10 + (qrSize + 20) + 12 + 18 /* code */ + padBottom;

  doc
    .roundedRect(marginX, cardTop, contentWidth, cardHeight, 18)
    .fillAndStroke(CARD_BG, "#e8b84b55");
  doc.lineWidth(1);

  const centerX = pageWidth / 2;
  let cursorY = cardTop + padTop;

  doc
    .fillColor(TEXT)
    .font("Helvetica-Bold")
    .fontSize(15)
    .text(displayName, marginX + 16, cursorY, { width: contentWidth - 32, align: "center" });
  cursorY = doc.y + 10;

  doc
    .fillColor(GOLD)
    .font("Helvetica")
    .fontSize(8.5)
    .text("DANDIYA CELEBRATION KIT QR", marginX, cursorY, { width: contentWidth, align: "center", characterSpacing: 1.5 });
  cursorY += 20;

  const qrX = centerX - qrSize / 2;
  const qrY = cursorY;
  doc.roundedRect(qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 10).fill("#ffffff");
  doc.image(input.qrPngBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  cursorY = qrY + qrSize + 10 + 12;

  doc
    .fillColor(GOLD)
    .font("Courier-Bold")
    .fontSize(13)
    .text(input.publicCode, marginX, cursorY, { width: contentWidth, align: "center", characterSpacing: 2 });

  doc.y = cardTop + cardHeight + 14;

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8.5)
    .text(
      "Present this QR code at the event venue to collect your kit. The same QR code is verified by the event team during entry.",
      marginX,
      doc.y,
      { width: contentWidth, align: "center" }
    );
  doc.moveDown(0.8);

  const infoLine = (label: string, value: string) => {
    doc.font("Helvetica-Bold").fillColor(TEXT).fontSize(9.5).text(label, marginX, doc.y, { continued: true });
    doc.font("Helvetica").fillColor(MUTED).text(` ${value}`);
  };
  infoLine("Venue:", "Acharya Stadium");
  infoLine("Date:", "15 October 2026");
  infoLine("Entry:", "3:00 PM – 5:00 PM (gate closes at 5:00 PM)");
  infoLine("Event:", "4:00 PM – 9:00 PM");
  doc.moveDown(0.25);
  doc.fillColor(GOLD).font("Helvetica").fontSize(8.5).text("Entry is one-time only — once you exit, you cannot re-enter.", marginX, doc.y, { width: contentWidth });
  doc.fillColor(GOLD).text("No-refund policy applies to all registrations.", marginX, doc.y, { width: contentWidth });
  doc.moveDown(0.8);

  const columnGap = 20;
  const columnWidth = (contentWidth - columnGap) / 2;
  const leftX = marginX;
  const rightX = marginX + columnWidth + columnGap;
  const listTop = doc.y;

  doc.fillColor(GOLD).font("Helvetica").fontSize(8.5).text("DO'S", leftX, listTop, { characterSpacing: 1.5 });
  let leftY = doc.y + 3;
  for (const item of DOS) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`•  ${item}`, leftX, leftY, { width: columnWidth });
    leftY = doc.y + 2;
  }

  doc.fillColor(GOLD).font("Helvetica").fontSize(8.5).text("DON'TS", rightX, listTop, { characterSpacing: 1.5 });
  let rightY = doc.y + 3;
  for (const item of DONTS) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`•  ${item}`, rightX, rightY, { width: columnWidth });
    rightY = doc.y + 2;
  }

  doc.y = Math.max(leftY, rightY);
  doc.moveDown(1);

  doc
    .fillColor(MUTED)
    .font("Helvetica")
    .fontSize(8)
    .text("Acharya Stadium · 15 October 2026 · Entry from 3:00 PM, gate closes 5:00 PM", marginX, doc.y, {
      width: contentWidth,
      align: "center"
    });

  doc.end();
  return done;
}
