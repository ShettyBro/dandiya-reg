// Deliberately its own module, separate from api.ts. api.ts is imported by public/eagerly-bundled
// pages (landing, registration, status, pass) as well as every staff panel, so anything exported
// from it ends up in the main bundle those public pages ship with. Staff-only text — like a direct
// personal tech-support contact — must never appear in that bundle, only in the lazy-loaded staff
// route chunks (volunteer/admin/finance/verify) that actually import this file.
export const STAFF_SERVER_UNREACHABLE_MESSAGE = "Server not reachable/down. Contact Sudeep 9480063530 immediately.";
