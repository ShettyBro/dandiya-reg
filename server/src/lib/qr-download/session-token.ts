import jwt from "jsonwebtoken";

export const QR_DOWNLOAD_SESSION_TTL_SECONDS = 5 * 60;

interface SessionPayload {
  purpose: "qr-download";
}

export function issueQrDownloadSessionToken(secret: string): string {
  const payload: SessionPayload = { purpose: "qr-download" };
  return jwt.sign(payload, secret, { expiresIn: QR_DOWNLOAD_SESSION_TTL_SECONDS });
}

export function verifyQrDownloadSessionToken(token: string, secret: string): boolean {
  try {
    const payload = jwt.verify(token, secret) as SessionPayload;
    return payload.purpose === "qr-download";
  } catch {
    return false;
  }
}
