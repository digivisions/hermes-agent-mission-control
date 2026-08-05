# hermes-cc-run.mjs — the Mac-side Claude Code runner

## What this is

`hermes-cc-run.mjs` is the only piece of Spec E that runs **on the Mac**
(`annguyen@Andys-MacBook-Pro-3`), not on the VPS. It is versioned and
reviewed in this repo like everything else, but a `git pull` on the VPS does
**not** deploy it — it has to be copied to the Mac by hand after every change
(see Deploy below). The `{"ping":true}` probe reports its own `claude
--version`, so the boot log line tells you which copy answered.

It receives one JSON object on stdin, does exactly one of two things (health
probe, or a Claude Code run inside an isolated `git worktree`), and writes
one JSON object to stdout. See the header comment in the script for the
exact shape.

## Transport: direct SSH over Tailscale (E1 override)

The original design (Opus's architect pass, spec §1 E1) assumed the VPS
could never reach the Mac — a residential ISP, dynamic IP, no port-forward —
and called for a Mac-initiated **reverse SSH tunnel** (`ssh -N -R
127.0.0.1:2222:127.0.0.1:22`, held open by a launchd agent).

That assumption was wrong. The Mac (`100.73.30.127`) and the VPS
(`100.78.85.122`) are both on the same **Tailscale tailnet**, and Tailscale
SSH authenticates by node identity — no key file, no port-forward, no
launchd agent required. Verified directly from the VPS:

```
ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no annguyen@100.73.30.127 "echo MAC_REACHABLE"
→ MAC_REACHABLE   (exit 0, no password prompt, no key file)
```

So the bridge (`hermes-bridge/claude-code.mjs`) connects **straight to the
Mac's Tailscale IP**, on the standard port, with no `-i` flag:

| Var | Value | Why |
|---|---|---|
| `CC_SSH_HOST` | `100.73.30.127` | the Mac's Tailscale IP, not `127.0.0.1` |
| `CC_SSH_PORT` | `22` | the Mac's real sshd, not a forwarded `2222` |
| `CC_SSH_USER` | `annguyen` | |
| `CC_SSH_KEY` | *(empty)* | Tailscale SSH authenticates by node identity — there is no key file to point at. `claude-code.mjs`'s `sshArgs()` omits `-i` entirely when `CC_SSH_KEY` is blank. |

**§5.3 (the reverse tunnel + launchd agent) and §5.4 (the Cloudflare Tunnel
fallback) in the spec are not built.** They remain documented escape
hatches — if Tailscale SSH is ever disabled on this tailnet, §5.3's reverse
tunnel is the fallback transport, and §5.4 is the fallback to *that*
fallback. Nothing else in the spec changes: the runner contract, the
worktree isolation, the allowlist, and the `ccProbe()` boot check (which
still validates ssh + node + runner + `claude` in one round trip) are all
exactly as designed.

## Deploy

```bash
mkdir -p ~/.hermes/bin ~/.hermes/cc-worktrees
cp hermes-bridge/mac/hermes-cc-run.mjs      ~/.hermes/bin/
cp hermes-bridge/mac/hermes-cc-usage.mjs    ~/.hermes/bin/
cp hermes-bridge/mac/cc-token-export.sh     ~/.hermes/bin/
chmod +x ~/.hermes/bin/hermes-cc-run.mjs ~/.hermes/bin/hermes-cc-usage.mjs ~/.hermes/bin/cc-token-export.sh
```

The enforcing allowlist (`~/.hermes/cc-repos.allow`, E18) is a separate,
hand-maintained file on the Mac — one absolute repo path per line, `#`
comments allowed. It must stay in sync with `Client.repoPath` in Postgres;
see `prisma/seed-clients.ts`'s header comment.

## Manual smoke test

```bash
node ~/.hermes/bin/hermes-cc-run.mjs <<< '{"ping":true}'
# → {"ok":true,"ping":"pong","claude":"2.1.221 (Claude Code)","node":"v22..."}

node ~/.hermes/bin/hermes-cc-usage.mjs
# → {"pct":6,"windowHours":5,"resetsAt":"...","parserV":1,"fetchedAt":"...","tokenSource":"export-file"}
```

## The usage gauge's OAuth token (Spec G)

`hermes-cc-usage.mjs` reads the account's 5-hour utilization from
`GET https://api.anthropic.com/api/oauth/usage`. It is **read-only** — it
never refreshes, rotates or re-auths the token (G-R2), because rotating it
out of band logs Claude Code out on this Mac.

The keychain is GUI-session-only, so the VPS's non-interactive SSH session
cannot read it. `cc-token-export.sh` (LaunchAgent
`com.hermes.cc-token-export`, `StartInterval` 600) copies the blob verbatim
to `~/.hermes/state/cc-oauth-token` (0600), which is the only credential the
SSH path can see.

**Pitfall that broke this for a day (2026-08-05).** The login keychain holds
**two** generic-password items under the service `Claude Code-credentials`:

| acct | written by | state |
|---|---|---|
| `Claude Code` | a January 2026 build | dead — untouched since 2026-01-31 |
| `$USER` (`annguyen`) | current Claude Code | live — rewritten on every token refresh |

`security find-generic-password -s "Claude Code-credentials" -w` returns the
**first match**, which on this Mac is the January item. Both the exporter and
the reader therefore used a six-month-dead access token, and every usage read
came back `401 Invalid authentication credentials` — so the card never once
showed a real number. Both scripts now search **by account**
(`-a "$USER"` first) and rank candidates by `expiresAt`. If Claude Code ever
changes where it writes again, that ranking is what makes it self-correct;
`expiresAt` is only ever used to *rank*, never to reject (G-R3 — the metadata
has been observed to lie in both directions).

**Poll cadence.** 20 min (`CC_USAGE_THROTTLE_MS`), with a 15-min floor, plus a
same-cadence throttle cache in the script itself. The 429s seen during the
outage were **not** account quota (utilization was 4–7% throughout) — they
were the penalty bucket for repeatedly presenting a rejected credential; a
valid token gets `200` immediately. For reference the `claude-hud` plugin
polls the same endpoint with a 60s cache TTL, so 20 min is far inside what
this endpoint sustains. A `401` now asks for a 30-min backoff instead
(`AUTH_STALE_BACKOFF_S`), since only Claude Code refreshing the token can fix
it, and it recovers on its own once that happens.
