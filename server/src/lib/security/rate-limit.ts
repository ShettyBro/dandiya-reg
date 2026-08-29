import rateLimit from "express-rate-limit";

export function createRateLimiter(windowMs: number, max: number) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false
  });
}

export const loginRateLimiter = createRateLimiter(15 * 60 * 1000, 10);
export const registrationRateLimiter = createRateLimiter(60 * 60 * 1000, 20);
export const uploadPresignRateLimiter = createRateLimiter(60 * 60 * 1000, 40);
export const paymentSubmitRateLimiter = createRateLimiter(60 * 60 * 1000, 20);
export const scanRateLimiter = createRateLimiter(60 * 1000, 60);
export const publicLookupRateLimiter = createRateLimiter(15 * 60 * 1000, 30);
