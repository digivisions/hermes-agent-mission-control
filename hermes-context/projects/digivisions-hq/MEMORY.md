DigivisionsHQ (formerly "Hermy HQ") is Digital Visions' own mission-control dashboard for Andy's Hermes agents and daily operations — production at myhq.digivisions.net. IMPORTANT: this is the system you are running inside. When someone asks about "HQ", "the dashboard" or "mission control", they mean this.
§
Architecture: dashboard (web) <-> Postgres message bus <-> bridge <-> Hermes CLI. The Next.js app writes agent requests to a shared Postgres database; a Node bridge (hermes-bridge) polls the bus, runs each request through the Hermes CLI inside the hermes Docker container, and writes results back. Nothing is exposed to the internet beyond the gated dashboard.
§
Stack: Next.js 16, React 19, Prisma + Postgres (Supabase), Tailwind v4. Deployed on the Hostinger VPS under pm2 as two apps — the Next.js app on port 3002 and hermes-bridge — with Caddy reverse-proxying myhq.digivisions.net. Auth is Google OAuth via NextAuth (JWT) against an allowlist. The bridge needs the DIRECT postgres:// URL, never the prisma:// Accelerate one.
§
Surfaces: cockpit home, Chief-of-Staff daily brief (08:00 local), client workspaces, project board, task/kanban mirror, approval inbox for side-effecting requests, infrastructure health, and a memory wiki mirrored one-way from Andy's Obsidian vault every 6 hours. The mirror NEVER writes back to the Mac.
§
Standing rules: clients and projects are two SEPARATE registries (prisma/seed-clients.ts and prisma/seed-projects.ts) — a client is never a project. Secrets live in .env on the VPS; reference the path, never the value. Every side-effecting action stays approval-gated. Ops detail: the digivisions-hq-operations skill.
§
Current phase (2026-08): rebranded from Hermy HQ on 2026-08-03; dashboard rebuilt around Andy's workflow with a draggable cockpit grid. Open: a Shopify Admin API token so Klaily revenue is automatic instead of hand-entered.
