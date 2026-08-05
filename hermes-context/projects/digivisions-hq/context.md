## DigivisionsHQ — myhq.digivisions.net

Self-hosted **mission-control dashboard** for Andy's Hermes agents and Digital
Visions operations. This is the system you are reading right now. Formerly
"Hermy HQ"; rebranded 2026-08-03.

### Architecture

```
dashboard (web) ↔ Postgres message bus ↔ bridge ↔ Hermes CLI
```

The Next.js app writes agent requests to a shared Postgres database; the Node
`hermes-bridge` polls the bus, runs each request through the Hermes CLI inside
the `hermes` Docker container, and writes results back. Nothing is exposed to
the internet beyond the gated dashboard.

### Stack & deployment

- Next.js 16 · React 19 · Prisma + Postgres (Supabase) · Tailwind v4
- VPS `72.62.79.32` (Hostinger); pm2 apps `hermy-hq` (port 3002) and
  `hermes-bridge`; Caddy proxies `myhq.digivisions.net` → 3002
- Hermes in Docker (`hermes` container, port 9119)
- Auth: Google OAuth (NextAuth JWT), allowlist `nguyenvuan@gmail.com`
- The bridge needs the **direct** `postgres://` URL, not `prisma://` Accelerate
- Repo (deployed): `~/projects/hermy-hq` on the VPS · Repo (local Mac):
  `/Users/annguyen/1-Development/hermes-agent-mission-control`

### Surfaces

Cockpit home · Chief-of-Staff daily brief (08:00 local) · client workspaces ·
project board · task/kanban mirror · approval inbox for side-effecting requests
· infrastructure health · memory wiki backed by a one-way mirror of the Obsidian
vault (rsync every 6h; **never** writes back to the Mac).

### How agents get their knowledge

The chat path injects nothing — a user message becomes the Hermes prompt
verbatim. So **100% of an agent's standing client knowledge comes from its
Hermes profile** (`memories/MEMORY.md` + `skills/`). `hermes-context/` in this
repo is the git-tracked source of truth, applied by two re-runnable seeders:

- `scripts/seed-profile-context.sh` → the profile inside the container
- `scripts/seed-hq-context.ts` → `contextNotes` + `documents` in this database

Both are sha-stamped and idempotent. The HQ seeder refuses to overwrite a
`contextNotes` that lacks the marker — that would be a note Andy typed by hand.

### Standing rules

- Clients and projects are **two separate registries**
  (`prisma/seed-clients.ts`, `prisma/seed-projects.ts`). A client is never a
  project.
- Secrets live in `.env` on the VPS — reference the path, never the value.
- Every side-effecting action stays approval-gated.
- `memory_char_limit` is 2200 and Mac paths are unreadable from the container —
  see `hermes-context/README.md`.

### Current phase (2026-08)

Rebranded and rebuilt around Andy's workflow: Active Projects, Klaily revenue,
Echo build status, task board, infrastructure, recent activity, on a draggable
cockpit grid. Light theme matching andynguyen.work (`#eaf4fb` bg, `#3a506b`
text, `#cc9038` accent, Space Grotesk headings).

**Open:** wire a Shopify Admin API token so Klaily revenue is automatic instead
of manually entered; verify all 7 infra services stay green; optional "reset
layout" button for the cockpit grid.

## Nguồn context

- Repo: `/Users/annguyen/1-Development/hermes-agent-mission-control` — `README.md` + `ONBOARDING.md`
- Obsidian: `Projects/DigivisionsHQ.md`
- Claude Code project memory: `~/.claude/projects/-Users-annguyen-1-Development-hermes-agent-mission-control/memory/` (thư mục tồn tại nhưng chưa có note nào)
