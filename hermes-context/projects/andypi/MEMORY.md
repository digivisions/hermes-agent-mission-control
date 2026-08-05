AndyPi is Andy's self-hosted homelab: a Raspberry Pi 4 Model B, hostname "andypi-os", running Raspberry Pi OS (Debian 13 "trixie") from a 128 GB USB SSD. It runs a Docker Compose stack of private services, doubles as a Tailscale exit node, and also hosts the Echo backend as a separate compose project.
§
Access model: private services publish ONLY on the Tailscale IP 100.80.9.27 — invisible to the LAN and the public internet. SSH is romanvalent@andypi-os.local (NOT annguyen). Everything lives in /srv/stack: one directory per service, a single docker-compose.yml, compose project "stack", secrets centralised in /srv/stack/.env at chmod 600. The Echo backend is separate, at /srv/echo-backend, public at echo.digivisions.net through a Cloudflare Tunnel.
§
Services and ports: Homepage 80, Portainer 9443, Uptime Kuma 3001, Healthchecks 8800, ntfy 8083, Vaultwarden 8084, Gitea 3300 web and 2222 ssh, n8n 5678, Bambuddy 8000 (the deliberate LAN-exposed exception, driving a Bambu Lab A1 printer), Home Assistant 8123 (host networking, for discovery), and a stealth toggle on 8091.
§
Stealth Mode: the Pi advertises as a Tailscale exit node and, when Stealth is ON, egresses through NordVPN (NordLynx, Threat Protection Lite on for ad blocking, kill-switch off, LAN discovery on). Pi-hole and Unbound were removed 2026-07-09 in favour of that.
§
Standing rules: SURGICAL config edits only, and BACK UP FIRST — an open(path,"w") that read after opening once truncated and wiped Homepage's services.yaml. Restart the service after any config change. Use exact-name process matching (pkill -x); a pkill -f once matched and killed the ssh session running it.
§
Current phase: active infrastructure. Remaining work: a cloudflared tunnel for public ingress limited to n8n webhooks and ntfy, restic backups with alerting, and closing Vaultwarden signups. Detail: the andypi-operations skill.
