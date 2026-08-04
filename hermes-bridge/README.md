# Hermes Bridge

Two-way sync between **Hermy HQ** (the deployed website) and **Hermes** (your local agent on the Mac mini), using the shared Postgres as a message bus. Nothing is exposed to the internet — the bridge only needs outbound access to Postgres and the local `hermes` CLI.

```
website  ──insert AgentRequest──▶  Postgres  ◀──poll & run──  bridge ──▶ hermes CLI
website  ◀──read HermesTask/────   Postgres  ◀──mirror───────  bridge ◀── hermes CLI
             AgentEvent/DataStore
```

## What it does
- **Pull (Hermes → website):** mirrors the kanban board into `HermesTask`, cron list + health into `DataStore`, and writes activity to `AgentEvent`.
- **Push (website → Hermes):** runs `AgentRequest` rows that are `queued` (safe) or `approved` (you approved a side-effecting one) via the `hermes` CLI, then writes results back. It never runs `awaiting_approval` rows.

## Setup (on the Mac mini)
1. Copy this folder to the mini (or `git pull` the repo there).
2. Install the one dependency:
   ```sh
   cd hermes-bridge && npm install
   ```
3. Make sure `hermes` is on PATH: `which hermes` should resolve (e.g. `~/.local/bin/hermes`).
4. Try it once, pointing at your DB:
   ```sh
   DATABASE_URL='postgres://…' HERMES_BOARD=default node bridge.mjs
   ```
   You should see `hermes-bridge up …`, and a "Bridge connected" event appear in the website's activity feed.
5. Run it forever with launchd:
   ```sh
   # edit the placeholders in ai.hermyhq.bridge.plist first (path, DATABASE_URL, PATH)
   cp ai.hermyhq.bridge.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/ai.hermyhq.bridge.plist
   ```
   Logs: `/tmp/hermes-bridge.out.log`, `/tmp/hermes-bridge.err.log`.

## Config (env)
| var | default | meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | same Postgres the website uses |
| `HERMES_BOARD` | `default` | kanban board slug to mirror |
| `HERMES_BIN` | `hermes` | path to the CLI if not on PATH |
| `BRIDGE_POLL_MS` | `5000` | how often to check for new requests |
| `BRIDGE_MIRROR_MS` | `30000` | how often to mirror kanban/cron/health |
| `BRIDGE_RUN_TIMEOUT_MS` | `240000` | max time for one agent run |

## Notes / assumptions
- CLI arg shapes (`hermes kanban create <title>`, `hermes cron create <schedule> <prompt>`) are best-effort for Hermes v0.17.x — if your build differs, tweak `runRequest()` in `bridge.mjs`.
- The bridge writes to Postgres with plain SQL, so it doesn't need Prisma.
- Safe by design: side-effecting work waits for your approval in the website's Approval Inbox before the bridge will touch it.

## Krisna — proactive assistant (Spec F, Phase 4)

Four DataStore keys: `assistant-config` (UI-written, bridge-read), `assistant-state` (bridge-only: lastDigest, approvalNudged, infraDownSince, tgOffset, ccNudgeSentAt), `assistant-digest-log` (ring buffer, cap 20), `assistant-decisions` (dashboard panel feed).

Two new kinds: `digest` (global morning/evening + on-demand Telegram briefing, profile = DIGEST_PROFILE, fallback renderer if LLM fails — never silent) and `report` (per-client on-demand summary, answered in-thread, triggered by `REPORT_RE` in chat).

Env (hermes-bridge/.env): `DIGEST_PROFILE=admin`, `ASSISTANT_TELEGRAM_INBOUND=1` (0 disables inbound). Telegram inbound = short-poll getUpdates gated to TELEGRAM_CHAT_ID.

Manual trigger for debugging:
```sql
INSERT INTO "AgentRequest"(id,origin,kind,title,prompt,status,"createdAt","updatedAt")
VALUES ('t-digest-1','hermes','digest','Krisna digest (manual)','{"slot":"ondemand"}','queued',now(),now());
```

## Claude usage (Spec G)

DataStore key `claude-usage`: { fetchedAt, source, pct, windowHours, resetsAt, lastCostUsd, lastRunAt, rawNote, parserV } — usage % (never raw tokens; limit_dollars is null), 5h/7d rolling window, reset time. Read on the Mac via the OAuth usage API (keychain token, read-only, never rotated) through `~/.hermes/bin/hermes-cc-usage.mjs` — ground truth is the API, NOT a local sqlite cache. Throttles: 20-min read floor (15-min configurable) + 5-min write throttle; honor retryAfterS on 429. **Invariant (G-D4): a usage-read failure must never flip ccOnline.** parserV:1; if the API shape changes, pct:null + note, never a guess.

Manual probe: `ssh <mac-host> 'node ~/.hermes/bin/hermes-cc-usage.mjs'`

**Cost correction (G-1):** the runner now records cache_creation/cache_read/total_cost_usd. Pre-fix capture understated real cost by ~4 orders of magnitude (a "say OK" run is input 2 + output 4 tokens but cache 28891+23909, total_cost_usd ≈ 0.18). Any step change in cost charts is this bug fix, not a spike.
