import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth-tokens.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const SERVER_UNREACHABLE_CODE = "SERVER_UNREACHABLE";
// This fires after retries already failed (see the retry loop below), so it's already survived
// a couple of attempts — but it's still far more often a weak/unstable connection on the user's
// own device than an actual outage on our end, so lead with the thing they can fix themselves.
// A genuine server outage needs Sudeep specifically — the general organizer contacts (shown
// elsewhere for event/registration queries) can't fix infrastructure — so his number still shows
// to everyone, public and staff alike, as the fallback.
export const SERVER_UNREACHABLE_MESSAGE =
  "Could not reach the server. This is usually a weak or unstable connection — try switching to mobile data or a different WiFi network, then try again. If it still fails, contact Sudeep 9480063530.";

const REQUEST_TIMEOUT_MS = 40000;
const NETWORK_RETRY_DELAYS_MS = [500, 1500];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

// A brief mobile-network drop (very common outdoors/on campus WiFi) shouldn't immediately
// surface the alarming "contact Sudeep" message on the very first failed attempt — retry a
// couple of times with short backoff before concluding the server is genuinely unreachable.
async function fetchWithRetry(path: string, method: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  let response: Response | undefined;
  let networkError: unknown;
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      networkError = undefined;
      break;
    } catch (error) {
      networkError = error;
      const delayMs = NETWORK_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) break;
      await sleep(delayMs);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  if (networkError || !response) {
    throw new ApiError(0, SERVER_UNREACHABLE_CODE, SERVER_UNREACHABLE_MESSAGE, null);
  }
  return response;
}

// Login and refresh themselves must never trigger the refresh-and-retry dance below — a 401 from
// either of those is a real "wrong password" / "expired session" answer, not something another
// refresh attempt could fix, and retrying would just recurse.
const NO_REFRESH_PATHS = new Set(["/auth/login", "/auth/refresh"]);

let refreshPromise: Promise<boolean> | null = null;

// Concurrent requests that all hit a 401 at once (e.g. several panels load in parallel right as
// the access token expires) share a single in-flight refresh instead of each firing their own.
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const response = await fetchWithRetry("/auth/refresh", "POST", { "Content-Type": "application/json" }, { refreshToken });
        if (!response.ok) {
          clearTokens();
          return false;
        }
        const data = (await response.json()) as { accessToken: string; refreshToken: string };
        setTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        clearTokens();
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  let data: unknown;
  try {
    data = contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    throw new ApiError(0, SERVER_UNREACHABLE_CODE, SERVER_UNREACHABLE_MESSAGE, null);
  }

  if (!response.ok) {
    if ([502, 503, 504].includes(response.status)) {
      throw new ApiError(response.status, SERVER_UNREACHABLE_CODE, SERVER_UNREACHABLE_MESSAGE, null);
    }
    const envelope = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
    throw new ApiError(
      response.status,
      typeof envelope.code === "string" ? envelope.code : "UNKNOWN_ERROR",
      typeof envelope.message === "string" ? envelope.message : "Request failed",
      envelope.details
    );
  }

  if (!contentType.includes("application/json")) {
    throw new ApiError(response.status, SERVER_UNREACHABLE_CODE, SERVER_UNREACHABLE_MESSAGE, null);
  }

  return data as T;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const accessToken = getAccessToken();
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let response = await fetchWithRetry(path, method, headers, options.body);

  // No access token yet (fresh page load) or an expired one both show up as a 401 here — either
  // way, one silent refresh-and-retry is exactly the right response, using whatever refresh token
  // is in storage.
  if (response.status === 401 && !NO_REFRESH_PATHS.has(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = { ...headers };
      const newAccessToken = getAccessToken();
      if (newAccessToken) {
        retryHeaders["Authorization"] = `Bearer ${newAccessToken}`;
      }
      response = await fetchWithRetry(path, method, retryHeaders, options.body);
    }
  }

  return parseResponse<T>(response);
}
