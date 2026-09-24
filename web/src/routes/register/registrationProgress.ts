import type { RegistrationType } from "./registrationTypes.js";

// Persists in-progress registration state so a low-end phone that discards the tab while the
// user is away completing payment in the ERP (a different app/tab) doesn't lose their place —
// without this, returning to the browser recreated the page from scratch and dumped them back at
// "Choose your registration category" even though a real registration already existed server-side.
// A sliding 10-minute TTL means an abandoned/stale attempt naturally expires and a later visit
// starts a genuinely fresh registration — multiple registrations from the same device remain fine.

const STORAGE_KEY = "dandiya-registration-progress";
const TTL_MS = 10 * 60 * 1000;

export interface RegistrationProgress {
  idempotencyKey: string;
  step: number;
  registrationType: RegistrationType | null;
  registrationId: string | null;
  publicCode: string | null;
  savedAt: number;
}

export function loadRegistrationProgress(): RegistrationProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistrationProgress;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRegistrationProgress(progress: Omit<RegistrationProgress, "savedAt">): void {
  try {
    const record: RegistrationProgress = { ...progress, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — the wizard still works in-memory
    // for the current tab session, it just won't survive a full page reload.
  }
}

export function clearRegistrationProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
}
