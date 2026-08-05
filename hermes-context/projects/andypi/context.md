## AndyPi — self-hosted homelab

Raspberry Pi 4 Model B ("andypi-os") booting Raspberry Pi OS (Debian 13
"trixie") from a 128 GB USB SSD. Runs a Docker Compose stack of private
services reachable **only over Tailscale**, doubles as a Tailscale exit node
with a NordVPN "Stealth Mode" toggle, and also hosts the Echo backend as a
separate compose project.

### Host

- Pi 4 Rev 1.2, root on `/dev/sda2` (USB SSD); timezone Asia/Ho_Chi_Minh
- LAN `192.168.68.0/24`, static `wlan0` `192.168.68.183`, mDNS `andypi-os.local`
- SSH: `ssh romanvalent@andypi-os.local` — **not** `annguyen`
- Tailscale `100.80.9.27` (MagicDNS `andypi-os.tailacf09c.ts.net`)
- Docker 29.6 + Compose v5.3

### Services

Everything lives in `/srv/stack` — one dir per service, a single
`docker-compose.yml`, compose project `stack`, secrets in `/srv/stack/.env`
(chmod 600). Docker network `172.28.0.0/16`.

| Service | Port | Notes |
|---|---|---|
| Homepage | 80 | dashboard; live Bambuddy printer widget |
| Portainer | 9443 (https) | |
| Uptime Kuma | 3001 | |
| Healthchecks | 8800 | moved from 8000 to free it for Bambuddy |
| ntfy | 8083 | |
| Vaultwarden | 8084 | signups still open — close after account creation |
| Gitea | 3300 web / 2222 ssh | moved from 3000; container SSH on 2222 |
| n8n | 5678 | migrated from the Mac, encryption key preserved |
| Bambuddy | 8000 | LAN-exposed exception; Bambu Lab A1 "Katty" at 192.168.68.152 |
| Home Assistant | 8123 | `network_mode: host` for discovery; Tuya integration |
| Stealth toggle | 8091 | `/on` `/off` `/status`, tailnet-only |

**Access model:** private services publish only on `100.80.9.27:<port>` —
invisible to LAN and public. Bambuddy is the single deliberate exception.

The **Echo backend** is separate: `/srv/echo-backend`, compose project `echo`,
API on host `:8010`, public at `echo.digivisions.net` via Cloudflare Tunnel.

### Exit node / Stealth Mode

The Pi advertises as a Tailscale exit node; with Stealth ON, egress goes through
NordVPN (NordLynx, Threat Protection Lite ON for ad blocking, kill-switch OFF,
LAN discovery ON) via Singapore. Port 41641 and `100.64.0.0/10` are allowlisted
so the tailnet survives a VPN connect. Pi-hole + Unbound were removed 2026-07-09
in favour of NordVPN Threat Protection.

### Standing rules

- **Surgical config edits only, back up first.** `open(p,"w")` truncates before
  reading — this once wiped Homepage's `services.yaml`. `cp file file.bak`, edit
  narrowly, restart the service.
- **`pkill -x`, never `pkill -f`.** A `pkill -f 'nordvpn login'` matched the ssh
  wrapper and killed the session running it.
- Suspect UAS mode first on a boot hang — the JMicron `152d:0562` adapter needs
  `usb-storage.quirks=152d:0562:u` in `/boot/firmware/cmdline.txt`.

### Current phase

Active infrastructure — last live check 2026-07-28 showed 2+ weeks uptime, 14
running containers, and a healthy Echo API.

**Remaining:** Phase 3 cloudflared tunnel for public ingress limited to n8n
webhooks + ntfy (then update n8n `WEBHOOK_URL` and the ntfy base URL off the
`100.80.9.27` placeholder) · Phase 4 restic backups (local + offsite), systemd
timer, ntfy alerts · hardening: `SIGNUPS_ALLOWED=false` on Vaultwarden, move
generated secrets into Vaultwarden.

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Users-annguyen-Documents-1-Development-RaspberryPi/memory/` (4 notes)
- Thư mục vận hành (Mac): `/Users/annguyen/Documents/1-Development/RaspberryPi` — `CLAUDE.md`, `ANDYPI-IMPLEMENTATION-PLAN.md`, `ANDYPI-SPLIT-TUNNEL-DESIGN.md`
- Credentials: `andypi-credentials.txt` (Mac) và `/srv/stack/.env` (Pi) — chỉ tham chiếu, không sao chép
- Obsidian: `Projects/RaspberryPi (AndyPi).md`
