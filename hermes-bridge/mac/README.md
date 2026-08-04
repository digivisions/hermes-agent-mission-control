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
cp hermes-bridge/mac/hermes-cc-run.mjs ~/.hermes/bin/
chmod +x ~/.hermes/bin/hermes-cc-run.mjs
```

The enforcing allowlist (`~/.hermes/cc-repos.allow`, E18) is a separate,
hand-maintained file on the Mac — one absolute repo path per line, `#`
comments allowed. It must stay in sync with `Client.repoPath` in Postgres;
see `prisma/seed-clients.ts`'s header comment.

## Manual smoke test

```bash
node ~/.hermes/bin/hermes-cc-run.mjs <<< '{"ping":true}'
# → {"ok":true,"ping":"pong","claude":"2.1.221 (Claude Code)","node":"v22..."}
```
