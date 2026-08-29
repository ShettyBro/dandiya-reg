# Dandiya Night 2026

Event registration, payment verification, digital pass and QR attendance platform. Full specification: `docs/Dandiya_Night_2026_SRS_Implementation_Ready.docx` / `.pdf`. Engineering contract: `CLAUDE.md`. Implementation progress, decisions, and test records: `ai/` (see `ai/HANDOFF.md` for the current handoff summary).

## Architecture

- **Frontend** (`web/`): React 19 + Vite + TypeScript, Tailwind CSS, Framer Motion (`motion`), React Router. Deploys to Vercel, independently of the backend (see `ai/DECISIONS.md` #17).
- **Backend** (`server/`): Node.js + Express 5 + TypeScript, Prisma ORM, Zod validation, Argon2id password hashing.
- **Database**: Neon PostgreSQL (external, no local Postgres container).
- **Object storage**: Cloudflare R2 (private bucket), browser uploads directly via presigned PUT, staff reads via short-lived presigned GET.
- **Email**: Brevo Transactional API with a durable, database-backed job outbox (`email_jobs` table) processed by a separate worker process.
- **Deployment**: same Docker image runs the API (`node dist/app/server.js`) and the email worker (`node dist/jobs/email.worker.js`) as separate containers/processes. Local Ubuntu + Docker + Caddy + Cloudflare Tunnel is primary; Railway is a manual standby using the same image and environment contract.

## What's here

- Public site: festival landing page, mobile-first registration (photo + payment proof upload direct to R2), status lookup, digital pass retrieval.
- Volunteer PWA: installable, camera-based QR scanning, single-entry enforcement, Team-Leader-gated override.
- Admin/Finance: dashboards, registration search, payment approval queue, volunteer and staff-credential management, CSV exports, audit log.

## Repository layout

```text
server/     Express API + Prisma schema + email worker + tests
web/        React/Vite frontend (public site, admin/finance, volunteer PWA)
docs/       SRS baseline + delivery docs (deployment, failover, security, test plan)
ai/         Claude working docs (plan, status, decisions, test reports) — git-ignored
Dockerfile  Multi-stage production image (builds server/)
docker-compose.yml  Local api + worker services
Caddyfile.example   Internal reverse-proxy template
.env.example         Full environment variable contract (placeholders only)
```

## Local development

Requires Node.js 22+, npm, and Docker (for the full local stack).

```bash
# backend
cd server
npm install
cp .env.example .env   # fill in real values, never commit this file
npm run prisma:generate
npm run dev             # http://localhost:3000

# frontend
cd web
npm install
npm run dev              # http://localhost:5173
```

## Testing

```bash
cd server && npm test   # 15 test files, run against a real Neon database
cd web && npm test
```

See `docs/TEST_PLAN.md` for the full test matrix mapped to the SRS, and `ai/TEST_REPORT.md` for the actual commands/output recorded per phase.

## Deployment

Local Docker Compose brings up the `api` and `worker` services against `server/.env`; Caddy (run separately on the host, per `Caddyfile.example`) and Cloudflare Tunnel handle public ingress. Railway acts as a manual standby using the same Docker image and the same `DATABASE_URL` / R2 / Brevo configuration. Full runbooks: `docs/DEPLOYMENT_LOCAL.md`, `docs/DEPLOYMENT_RAILWAY.md`, `docs/FAILOVER_RUNBOOK.md`, `docs/SECURITY.md`.

## Status

All implementation phases are complete — see `ai/HANDOFF.md` for what's fully working versus what still needs real credentials (Cloudflare R2 keys, ERP payment URL) or infrastructure access (a Railway account, the production Ubuntu host) that weren't available during implementation.
