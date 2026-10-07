import type { RegistrationType } from "./registrationTypes.js";

// Persists in-progress registration state so a low-end phone that discards the tab while the
// user is away completing payment in the ERP (a different app/tab) doesn't lose their place —
// without this, returning to the browser recreated the page from scratch and dumped them back at
// "Choose your registration category" even though a real registration already existed server-side.
// Deliberately no time-based expiry: an ERP payment can genuinely take much longer than any fixed
// window, and a fixed TTL just relocates the same lost-progress complaint to whoever is slower
// than it. Progress instead only clears on an explicit action — reaching the final success step
// (registration.tsx clears it once confirmed), or the person tapping "Register another person"
// there to deliberately start a fresh attempt on the same device.

const STORAGE_KEY = "dandiya-registration-progress";

export interface RegistrationProgress {
  idempotencyKey: string;
  step: number;
  registrationType: RegistrationType | null;
  registrationId: string | null;
  publicCode: string | null;
  // Whether the person has already clicked through to the external ERP payment page. Without
  // persisting this, a reload on return from the ERP (very common — many mobile browsers and
  // in-app browsers discard backgrounded tabs) correctly restored the step number but always
  // re-showed the payment *instructions* screen instead of the transaction-ID entry form, which
  // reads to the user as "it lost my progress" even though the registration itself was intact.
  paymentProceeded: boolean;
  savedAt: number;
}

export function loadRegistrationProgress(): RegistrationProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistrationProgress;
    if (typeof parsed.savedAt !== "number") {
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
