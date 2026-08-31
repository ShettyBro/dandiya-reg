let cachedCsrfToken: string | undefined;

export function setCsrfToken(token: string | undefined): void {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | undefined {
  return cachedCsrfToken;
}
