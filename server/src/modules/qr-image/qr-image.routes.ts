import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { sendError } from "../../app/middleware/errors.js";
import { qrImageRateLimiter } from "../../lib/security/rate-limit.js";

const querySchema = z.object({
  data: z.string().trim().min(1).max(500)
});

// Renders a QR code PNG from an already-opaque, already-signed payload (the caller must already
// have the data to encode -- this is pure rendering, same trust model as the third-party QR
// image service it replaces, just served from our own domain instead of api.qrserver.com.
// That matters for email deliverability: a QR code image hosted on an unfamiliar third-party
// domain is a scored signal for spam/phishing filters, confirmed by direct A/B testing -- the
// exact same email with the QR code removed delivered fine, with it included it was silently
// dropped (no bounce, not even spam) every time.
export function createQrImageRouter(): Router {
  const router = Router();

  router.get("/qr-image.png", qrImageRateLimiter, async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      sendError(req, res, 400, "VALIDATION_ERROR", "Invalid QR image request", parsed.error.flatten());
      return;
    }

    try {
      const buffer = await QRCode.toBuffer(parsed.data.data, {
        errorCorrectionLevel: "M",
        margin: 2,
        width: 400,
        type: "png"
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.status(200).send(buffer);
    } catch {
      sendError(req, res, 500, "QR_GENERATION_FAILED", "Could not generate QR code image");
    }
  });

  return router;
}
