---
name: andypi-operations
description: Use for anything about AndyPi, the Raspberry Pi homelab — the /srv/stack Docker Compose services, Tailscale access and the exit node, NordVPN Stealth Mode, Home Assistant and the Bambu printer, the Echo backend hosted there, boot or SSD problems, or backups and hardening.
---

# AndyPi — operations

## Host

Raspberry Pi 4 Model B, Rev 1.2, root on `/dev/sda2` (a 128 GB USB SSD).
Raspberry Pi OS, Debian 13 "trixie". Timezone Asia/Ho_Chi_Minh.

- LAN `192.168.68.0/24`, static `wlan0` at `192.168.68.183`, mDNS
  `andypi-os.local`
- SSH: `ssh romanvalent@andypi-os.local` — **not** `annguyen`. The Mac's ed25519
  key is authorised.
- Tailscale IP `100.80.9.27`, MagicDNS name `andypi-os.tailacf09c.ts.net`
- Docker 29.6 with Compose v5.3

Prefer `andypi-os.local` over a raw IP — the DHCP address drifted before the
static IP was set. If the host is unreachable, diagnose in order: mDNS,
`arp -a`, `nc <host> 22`.

## The stack

Everything is in `/srv/stack` on the SSD: one directory per service, a **single**
`docker-compose.yml`, compose project `stack`, Docker network `172.28.0.0/16`.
Secrets are centralised in `/srv/stack/.env` (chmod 600).

| Service | Port | Notes |
|---|---|---|
| Homepage | 80 | dashboard; live Bambuddy printer widget |
| Portainer | 9443 (https) | admin password file under `/srv/stack/portainer/` |
| Uptime Kuma | 3001 | |
| Healthchecks | 8800 | moved from 8000 to free it for Bambuddy |
| ntfy | 8083 | |
| Vaultwarden | 8084 | **signups still open** — close after account creation |
| Gitea | 3300 web / 2222 ssh | moved from 3000; the image's bundled openssh holds :22 |
| n8n | 5678 | migrated from the Mac; encryption key preserved; TZ America/Los_Angeles |
| Bambuddy | 8000 | LAN-exposed exception; Bambu Lab A1 "Katty" at 192.168.68.152 |
| Home Assistant | 8123 | `network_mode: host` for discovery; Tuya / Smart Life integration |
| Stealth toggle | 8091 | `/on` `/off` `/status`, tailnet-only, systemd `stealth-toggle` |

**Access model:** every private service binds to the Tailscale IP only. Bambuddy
is the single deliberate exception, bound to `0.0.0.0` for LAN access.

The Echo backend is a **separate** compose project at `/srv/echo-backend`
(project name `echo`, API on host :8010), reachable publicly at
`echo.digivisions.net` through a Cloudflare Tunnel. Deploy it with the Echo
repo's `tools/deploy_pi.sh`, which rsyncs, rebuilds, runs migrations and
preserves the Pi's `.env`.

## Exit node and Stealth Mode

The Pi advertises as a Tailscale exit node. With Stealth ON, egress goes through
NordVPN (NordLynx) via Singapore, with Threat Protection Lite ON (that is the ad
blocking), kill-switch OFF and LAN discovery ON. Port 41641 and `100.64.0.0/10`
are allowlisted so the tailnet survives a VPN connect.

Pi-hole and Unbound were removed on 2026-07-09 in favour of NordVPN Threat
Protection — do not reintroduce local DNS filtering without a reason.

Caveats:

- The exit node must be **approved in the Tailscale admin console**.
- If forwarded traffic does not egress through Nord, add a MASQUERADE rule on
  the `nordlynx` interface.
- The NordVPN CLI's first run prompts for analytics consent — pipe `n` or it
  loops forever.

## The two footguns

1. **File truncation.** `open(p,"w").write(x + open(p).read())` truncates the
   file *before* the read runs. This wiped Homepage's `services.yaml` once.
   Always `cp file file.bak` before editing a stack config, make surgical edits,
   and restart the service afterwards.
2. **`pkill -f` self-kill.** `pkill -f 'nordvpn login'` matched the ssh wrapper
   and killed the session issuing it. Use exact-name matching: `pkill -x nordvpn`.

## Boot / hardware

First boot hung at "Waiting for root file system" — the JMicron `152d:0562`
USB-SATA adapter's buggy UAS mode. Fixed with
`usb-storage.quirks=152d:0562:u` in `/boot/firmware/cmdline.txt` (a **single
line**; a backup `cmdline.txt.bak` is on the boot filesystem). On any similar
hang, suspect UAS first and power brownout second.

## Remaining phases

- **Phase 3** — cloudflared tunnel for public ingress limited to n8n webhooks
  and ntfy; then update n8n's `WEBHOOK_URL` and ntfy's base URL away from the
  `100.80.9.27` placeholder.
- **Phase 4** — restic backups (local drive plus offsite), a systemd timer, and
  ntfy alerts.
- **Hardening** — set Vaultwarden `SIGNUPS_ALLOWED=false` once the intended
  accounts exist; move generated secrets into Vaultwarden.

## Routine check

```
ssh romanvalent@andypi-os.local
cd /srv/stack && docker compose ps
docker compose logs <service>
```

## Reading more

The implementation plan, the split-tunnel design and the credentials file live
on Andy's Mac; the Pi's own secrets are in `/srv/stack/.env`. Both are reference
only — never duplicate their contents into a note or a reply. If a question
needs them, ask Andy or route it through the Claude Code offload.
