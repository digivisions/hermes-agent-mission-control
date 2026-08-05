## VPS Dev Center

Self-hosted remote development environment on a Hostinger KVM2 VPS — Ubuntu
24.04.4 LTS, 8 GB RAM, 2 vCPU, 100 GB NVMe, IP `72.62.79.32`, SSH user `andy`.

> This is the **same box** that runs DigivisionsHQ (`myhq.digivisions.net`) and
> the Hermes container. A change here affects those.

### What runs on it

A browser-based dev stack — code-server, Agent Zero, OpenCode and Claude Code in
tmux — behind Caddy, with Netdata monitoring, fail2ban and scheduled backups.

- **Caddy in Docker** is the single TLS / reverse-proxy entry point. Reload with
  `docker kill --signal=USR1 caddy`, not a container restart.
- **Express serves static files too** (not Caddy `file_server`) — deliberate,
  to avoid mounting Docker volumes into the Caddy container.
- **PM2** for Node processes; **Docker Compose** for Agent Zero, Hermes, Caddy.
- **Docker log rotation lives in `daemon.json`** (`max-size: 10m`,
  `max-file: 3`) — deliberately *not* external logrotate.

### Public endpoints

`code.digivisions.net` · `agent.digivisions.net` · `monitor.digivisions.net` ·
`music.digivisions.net` — all HTTP 200 on 2026-07-28.

### Hosted: music landing page

Artist showcase at `music.digivisions.net`. Express on `127.0.0.1:3001` serves
both the static frontend and `/api/*`; Caddy proxies the domain. Track data
comes from a Google Sheet (`Sheet1!A2:G` — Title, Artist, SoundCloudURL, Genre,
Description, Featured, CoverImageURL) with a 5-minute in-memory cache, so sheet
edits lag slightly. PM2 process: `music-landing-api`. Runtime secrets in
`server/.env` on the VPS; `GOOGLE_SERVICE_ACCOUNT_JSON` must be minified to one
line.

### Tool selection (Andy's rule of thumb)

OpenCode for everyday coding · Agent Zero for DevOps/automation · Claude Code
for complex or critical work · the local Mac for Mac/iOS builds. Cost strategy:
free OpenRouter-backed agents for routine work, paid Claude reserved for hard
tasks.

### The dockerd CPU incident (solved 2026-04-27)

`logrotate` with `copytruncate` on `/var/lib/docker/containers/*/*.log`
truncated files in place while Docker's log-tailer goroutines kept stale offsets
past EOF. They busy-polled (`pread64` → 0 bytes → retry, ~31k/sec) and leaked a
goroutine on every container restart, for 14 days → dockerd at 78–181% CPU, 0%
idle. Fixed by removing the Docker block from `/etc/logrotate.d/custom-vps` and
restarting docker: 78% → 5.9% CPU, load 4.3 → 1.6.

**Rule: never run external logrotate (especially `copytruncate`) on Docker
json-file logs.**

The playbook that found it: `ps aux` → `top -H -p <pid>` for hot threads →
`strace -c` for the syscall profile → `ls /proc/<pid>/fd/<n>` to identify the
stale file → read the config that touches it.

### Open items

- **Credentials in plaintext**, unrotated: project-local instruction files
  contain them, and a Google service-account key JSON sits in the local project
  root. Rotation plus replacing values with secret-location references is its
  own separately approved change.
- No SSH-level audit of OS, containers, PM2, firewall, backups or resource
  health since April 2026 — do a read-only health pass before the next
  infrastructure change.
- Reconcile the old music-landing setup notes (service account, DNS A record,
  `./deploy.sh` listed as pending) against the live, reachable site.

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Users-annguyen-Documents-1-Development-VPS-DEV-CENTER/memory/` (4 notes)
- Thư mục dự án (Mac): `/Users/annguyen/Documents/1-Development/VPS_DEV_CENTER` — lưu ý **gạch dưới**, không phải gạch ngang; chứa `music-landing/`, docker-compose của Caddy/Agent Zero/Hermes, fail2ban, báo cáo security audit
- Obsidian: `Projects/VPS Dev Center.md` + `VPS Development Center-Complete Setup Guide`
- Trên VPS: `~/projects/` và `~/Caddyfile`
