---
name: digivisions-hq-operations
description: Use for anything about DigivisionsHQ / myhq.digivisions.net — the dashboard itself, the Hermes bridge and message bus, agent request routing, client and project registries, profile provisioning and context seeding, the daily brief, deployment on the VPS, or the Prisma schema behind any of it.
---

# DigivisionsHQ — operations

## The three moving parts

1. **The dashboard** — a Next.js 16 / React 19 app (Prisma + Postgres,
   Tailwind v4), served by pm2 on port 3002 behind Caddy at
   `myhq.digivisions.net`. Auth is Google OAuth through NextAuth (JWT) against
   an allowlist.
2. **The message bus** — a shared Postgres database (Supabase). The dashboard
   writes `AgentRequest` rows; nothing is called synchronously.
3. **The bridge** — `hermes-bridge`, a Node process under pm2 that polls the
   bus, runs each request through the Hermes CLI inside the `hermes` Docker
   container, and writes results back.

The bridge requires the **direct** `postgres://` connection string. A
`prisma://` Accelerate URL will not work for it.

## Registries — clients vs projects

Two separate tables, two separate seeds, and they must not be conflated:

- `prisma/seed-clients.ts` → `Client` — paid client work.
- `prisma/seed-projects.ts` → `Project` — Digital Visions' own projects.

Both carry `contextNotes` and `documents`, both are PATCH-able through their
API routes, and both render in the workspace UI. Seed discipline in both files
is identical: update-on-conflict refreshes descriptive fields but **never**
clobbers `status`, `hermesProfile`, `model`, `sortOrder`, `accent` or
`contextNotes` — those belong to Andy or to the provisioning script the moment
they are touched outside the seed.

## How an agent gets its knowledge

The chat path injects **nothing**: a user's message becomes the Hermes prompt
verbatim, both in the API route and in the bridge. Therefore 100% of an agent's
standing knowledge about a client comes from its **Hermes profile** —
`memories/MEMORY.md` (note the plural directory) plus `skills/<name>/SKILL.md`.

That is why `hermes-context/` exists in this repo as the git-tracked source of
truth, with two re-runnable sinks:

- `scripts/seed-profile-context.sh` — writes `MEMORY.md` and
  `<slug>-operations/SKILL.md` into the profile inside the container.
- `scripts/seed-hq-context.ts` — writes `context.md` and `documents.json` into
  `Client.contextNotes` / `Client.documents` (and the `Project` equivalents).

Both stamp a marker on line 1:
`<!-- hermes-context v1 slug=… sha=… seeded=… -->`. Same sha means the run is a
no-op. The HQ seeder refuses to overwrite a `contextNotes` that lacks the marker
— that is a note Andy hand-edited in the UI, and losing it would be worse than
doing nothing.

Two constraints that are not negotiable:

- `memory_char_limit` is **2200**. Over-budget content is truncated by Hermes at
  a point we do not control. The seeder dies rather than truncating.
- Paths on Andy's Mac — his home directory, the external DATA2 drive, the
  personal notes vault — are **unreadable from the container**. They are
  rewritten by `hermes-context/_lib/rewrite-paths.sed`, and a guard grep kills
  the run if any survive. Seeding a path the agent cannot open trades "no
  context" for "context that lies", which is worse.

## Provisioning a new client profile

`scripts/provision-profile.sh <slug>` clones the `admin` template profile, pins
the model, writes `.env`, smoke-tests, and updates the registry. A clone of
`admin` has **no client knowledge** — which is exactly how a client agent ends up
answering "I have no context for this project". Context seeding is therefore a
step of provisioning, not an afterthought.

A corollary: **a re-provision wipes a profile.** Any rebuild restores admin's
memory over the seeded file. Re-seeding from `hermes-context/` is the repair,
and it is one command.

## Deployment

- VPS: Hostinger, `72.62.79.32`. Repo deployed at `~/projects/hermy-hq`
  (branch `main`); the bridge lives in its `hermes-bridge/` subdirectory with
  its own pm2 ecosystem config.
- Caddy reverse-proxies `myhq.digivisions.net` → `:3002`.
- Hermes runs in Docker (container `hermes`, port 9119).
- The daily Chief-of-Staff brief runs at 08:00 local via the bridge, reading a
  mirrored copy of Andy's Obsidian vault. The mirror is **one-way**, refreshed
  by rsync every 6 hours; it never writes back to the Mac.
- The VPS reaches the Mac over a Tailscale mesh via sshfs mounts (user-space,
  no sudo), auto-mounted on boot.
- Secrets live in `.env` on the VPS. Never commit them; reference paths only.

## Standing rules

- Every side-effecting agent action stays approval-gated through the inbox.
  Do not add a path that bypasses it.
- Do not prepend `contextNotes` to prompts in the bridge. It was considered and
  rejected: it pays full context cost on every turn including "ok, thanks", puts
  the DB in the hot path of every run, and diverges from the triage/offload path
  that passes prompts through untouched. Profile memory is the mechanism that
  exists for standing knowledge — use it.
- Never run `prisma db push` or a migration as a side effect of another task.

## Reading more

`README.md` and `ONBOARDING.md` in the repo are the install and architecture
references. Spec documents live on Andy's Mac. If a question needs them, ask
Andy or route it through the Claude Code offload.
