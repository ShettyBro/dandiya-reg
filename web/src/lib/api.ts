import { readCsrfToken } from "./csrf.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";

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
    const csrfToken = readCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const envelope = typeof data === "object" && data ? (data as Record<string, unknown>) : {};
    throw new ApiError(
      response.status,
      typeof envelope.code === "string" ? envelope.code : "UNKNOWN_ERROR",
      typeof envelope.message === "string" ? envelope.message : "Request failed",
      envelope.details
    );
  }

  return data as T;
}
