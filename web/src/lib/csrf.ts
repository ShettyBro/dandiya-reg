export function readCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1] ?? "") : undefined;
}
