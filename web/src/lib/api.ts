import { getCsrfToken, setCsrfToken } from "./csrf.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

export const SERVER_UNREACHABLE_CODE = "SERVER_UNREACHABLE";
export const SERVER_UNREACHABLE_MESSAGE = "Server not reachable/down. Contact Sudeep 9480063530 immediately.";

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (method !== "GET") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new ApiError(0, SERVER_UNREACHABLE_CODE, SERVER_UNREACHABLE_MESSAGE, null);
  }

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

  if (data && typeof data === "object" && typeof (data as Record<string, unknown>).csrfToken === "string") {
    setCsrfToken((data as Record<string, unknown>).csrfToken as string);
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
