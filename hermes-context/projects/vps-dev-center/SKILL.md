---
name: vps-dev-center-operations
description: Use for anything about the Hostinger VPS dev environment — code-server, Agent Zero, OpenCode, Caddy reverse proxy and TLS, PM2 processes, Netdata, the music.digivisions.net landing page and its Google Sheet feed, backups and fail2ban, or a VPS performance or CPU incident.
---

# VPS Dev Center — operations

## The box

Hostinger KVM2 VPS: Ubuntu 24.04.4 LTS, 8 GB RAM, 2 vCPU, 100 GB NVMe, IP
`72.62.79.32`, SSH user `andy`. This is the same host that runs DigivisionsHQ
(`myhq.digivisions.net`) and the Hermes container — a change here affects those.

Projects live under `~/projects/`; the Caddyfile is at `~/Caddyfile`.

## Architecture decisions

- **Caddy runs in Docker** as the single TLS / reverse-proxy entry point.
  Reload after a config change with `docker kill --signal=USR1 caddy` — a
  container restart is not the right tool.
- **Express serves static files too**, rather than Caddy's `file_server`. This
  is deliberate: it avoids mounting Docker volumes into the Caddy container.
- **PM2** manages Node processes; **Docker Compose** manages Agent Zero, Hermes
  and Caddy.
- **Docker log rotation is handled by `daemon.json`** (`max-size: 10m`,
  `max-file: 3`) and deliberately *not* by external logrotate. See the incident
  below — this is not a style preference.

## Public endpoints

`code.digivisions.net` · `agent.digivisions.net` · `monitor.digivisions.net` ·
`music.digivisions.net` — all returned HTTP 200 on 2026-07-28.

## Music landing page

An artist showcase at `music.digivisions.net`.

- Express on `127.0.0.1:3001` serves both the static frontend and `/api/*`;
  Caddy proxies the domain to it.
- Track data comes from a Google Sheet, range `Sheet1!A2:G` — Title, Artist,
  SoundCloudURL, Genre, Description, Featured, CoverImageURL — behind a 5-minute
  in-memory cache. Sheet edits therefore lag slightly; that is not a bug.
- PM2 process name: `music-landing-api`.
- Runtime secrets are in `server/.env` on the VPS (`GOOGLE_SHEET_ID`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`). **`GOOGLE_SERVICE_ACCOUNT_JSON` must be
  minified onto one line** in `.env` or it will not parse.
- Historical setup notes still list the service account, DNS A record and
  `./deploy.sh` as pending. The site is live — reconcile the notes against the
  running host before changing anything.

## The dockerd CPU incident (solved 2026-04-27) — and its rule

**Symptom:** dockerd at 78–181% CPU, 0% idle, for 14 days.

**Cause:** `logrotate` with `copytruncate` on
`/var/lib/docker/containers/*/*.log` truncated files in place while Docker's
log-tailer goroutines kept stale offsets past EOF. They busy-polled — `pread64`
returning 0 bytes, retried roughly 31,000 times a second — and leaked a fresh
goroutine on every container restart.

**Fix:** removed the Docker block from `/etc/logrotate.d/custom-vps` and
restarted docker. CPU went 78% → 5.9%, load 4.3 → 1.6.

**Rule: never run external logrotate — especially `copytruncate` — over Docker
json-file logs.** `daemon.json` owns rotation.

**The debugging playbook that found it**, worth reusing on any "process is hot"
problem:

1. `ps aux` — find the process
2. `top -H -p <pid>` — find the hot *threads*
3. `strace -c` — get the syscall profile
4. `ls /proc/<pid>/fd/<n>` — identify the file behind the hot descriptor
5. read the config that touches that file

## Tool selection

Andy's rule of thumb, and the cost strategy behind it:

| Work | Tool |
|---|---|
| Everyday coding | OpenCode |
| DevOps / automation | Agent Zero |
| Complex or critical | Claude Code |
| Mac / iOS builds | the local Mac |

Free OpenRouter-backed agents cover routine work; the paid Claude subscription
is reserved for hard tasks.

## Security posture — open items

- A Google service-account key JSON sits in the local project root on the Mac,
  and **project-local instruction files contain plaintext credentials**. They
  are unrotated. Treat them as sensitive: never echo, quote or copy a value.
  Rotation plus replacing the plaintext with secret-location references is its
  own approved change, not a side effect of another task.
- Hardening artifacts exist: a fail2ban config and two security audit reports in
  the local project folder. Review them for open items before adding new
  exposure.
- No SSH-level audit of OS, containers, PM2 state, firewall, backups or resource
  health has been done since April 2026 — do a **read-only** health pass before
  the next infrastructure change.

## Routine check

```
ssh andy@72.62.79.32
docker ps
pm2 ls
# Netdata on :19999 — confirm dockerd CPU is still low
```

## Reading more

The complete setup guide, the security audit reports and the deploy scripts live
on Andy's Mac. Note the local folder name uses underscores while the Claude
project slug uses hyphens — easy to mistype. If a question needs those files,
ask Andy or route it through the Claude Code offload.
