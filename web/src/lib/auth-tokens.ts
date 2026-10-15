// Bearer-token auth storage. Cookies don't work reliably here: the frontend and API live on
// unrelated domains (different eTLD+1), and iOS Safari -- along with every other iOS browser,
// since Apple requires them all to use WebKit -- blocks third-party cookies by default regardless
// of SameSite=None, which silently broke login on every iOS device. An Authorization header has
// no such restriction.
//
// The access token lives in memory only (lost on reload, which is fine -- it's short-lived and
// apiRequest transparently re-mints one from the refresh token on first use after a reload). The
// refresh token is the one thing that needs to survive a reload/new tab, so it goes in
// localStorage; that's a deliberate trade-off versus an HttpOnly cookie (JS can read it, so an XSS
// bug could steal it), accepted because the cross-domain cookie approach doesn't work on iOS at
// all here.
const REFRESH_TOKEN_STORAGE_KEY = "dandiya_refresh_token";

let accessToken: string | undefined;

export function getAccessToken(): string | undefined {
  return accessToken;
}

export function getRefreshToken(): string | undefined {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function setTokens(newAccessToken: string, newRefreshToken: string): void {
  accessToken = newAccessToken;
  try {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, newRefreshToken);
  } catch {
    // Private-browsing/storage-blocked contexts: the session just won't survive a reload.
  }
}

export function clearTokens(): void {
  accessToken = undefined;
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
