import rateLimit from "express-rate-limit";

export function createRateLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many attempts from this network. Please wait a few minutes and try again.",
        details: null,
        requestId: req.id ?? null
      });
    }
  });
}

export const loginRateLimiter = createRateLimiter(15 * 60 * 1000, 10);

// Registration/upload/payment/status-lookup are hit by hundreds of students on the same campus
// WiFi NAT, which all share one public IP as far as the server can tell — a per-IP limit sized
// for a single user falsely blocks the whole building. These stay generous (not removed outright,
// so a genuine single-source flood is still capped) while auth and gate-scanning stay tight since
// those aren't subject to shared-WiFi collision and matter more for abuse/security.
export const registrationRateLimiter = createRateLimiter(15 * 60 * 1000, 3000);
export const uploadPresignRateLimiter = createRateLimiter(15 * 60 * 1000, 5000);
export const paymentSubmitRateLimiter = createRateLimiter(15 * 60 * 1000, 3000);
export const publicLookupRateLimiter = createRateLimiter(15 * 60 * 1000, 600);

export const scanRateLimiter = createRateLimiter(60 * 1000, 60);
