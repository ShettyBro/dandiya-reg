import type { CookieOptions, Request, Response } from "express";
import { ACCESS_TOKEN_TTL_SECONDS_LONG } from "./tokens.js";
import type { Env } from "../../app/config/env.js";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_TOKEN_COOKIE = "csrf_token";

function baseCookieOptions(env: Env): CookieOptions {
  const isProduction = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/api/v1"
  };
}

export function setAuthCookies(
  res: Response,
  env: Env,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string }
): void {
  const base = baseCookieOptions(env);

  // The cookie's own maxAge is just a browser-side convenience, not the real enforcement -- the
  // JWT's own `exp` claim (verified server-side on every request) is what actually ends a
  // session, and that's role-aware (accessTokenTtlSecondsForRole). Using the longest possible
  // TTL here means the cookie never expires before a long-session role's token does; for
  // short-session roles the token itself still rejects requests well before this cookie would.
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: ACCESS_TOKEN_TTL_SECONDS_LONG * 1000
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  res.cookie(CSRF_TOKEN_COOKIE, tokens.csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
}

export function clearAuthCookies(res: Response, env: Env): void {
  const base = baseCookieOptions(env);
  res.clearCookie(ACCESS_TOKEN_COOKIE, base);
  res.clearCookie(REFRESH_TOKEN_COOKIE, base);
  res.clearCookie(CSRF_TOKEN_COOKIE, { ...base, httpOnly: false });
}

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCsrfSafeRequest(req: Request): boolean {
  return CSRF_SAFE_METHODS.has(req.method);
}
