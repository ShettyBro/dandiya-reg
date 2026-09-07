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
export const registrationRateLimiter = createRateLimiter(15 * 60 * 1000, 300);
export const uploadPresignRateLimiter = createRateLimiter(15 * 60 * 1000, 500);
export const paymentSubmitRateLimiter = createRateLimiter(15 * 60 * 1000, 300);
export const scanRateLimiter = createRateLimiter(60 * 1000, 60);
export const publicLookupRateLimiter = createRateLimiter(15 * 60 * 1000, 60);
