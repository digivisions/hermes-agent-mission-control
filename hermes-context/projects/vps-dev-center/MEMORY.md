VPS Dev Center is Andy's self-hosted remote development environment on a Hostinger KVM2 VPS — Ubuntu 24.04 LTS, 8 GB RAM, 2 vCPU, 100 GB NVMe, IP 72.62.79.32. It is the SAME box that runs DigivisionsHQ and the Hermes container, so "the VPS" in either conversation means this machine.
§
What runs on it: a browser-based dev stack — code-server, Agent Zero, OpenCode and Claude Code in tmux — behind Caddy, with Netdata monitoring, fail2ban and scheduled backups. Caddy runs in Docker as the single TLS/reverse-proxy entry point; reload it with a USR1 signal, not a container restart. PM2 manages Node processes; Docker Compose manages Agent Zero, Hermes and Caddy.
§
Public endpoints: code.digivisions.net, agent.digivisions.net, monitor.digivisions.net and music.digivisions.net. The music landing page is an artist showcase — an Express app on 127.0.0.1:3001 serving both the static frontend and /api/*, with track data pulled from a Google Sheet behind a 5-minute in-memory cache; the pm2 process is music-landing-api.
§
Tool-selection rule of thumb Andy uses: OpenCode for everyday coding, Agent Zero for DevOps and automation, Claude Code for complex or critical work, and the local Mac for anything Mac or iOS. Cost strategy: free OpenRouter-backed agents for routine work, the paid Claude subscription reserved for hard tasks.
§
Standing rules: NEVER run an external logrotate — especially with copytruncate — over Docker json-file logs. That caused the 2026-04-27 dockerd incident: 14 days of busy-polling goroutines at 78-181% CPU. Rotation belongs to daemon.json. Credentials sit in plaintext in local project instruction files and are still unrotated: treat them as sensitive and never echo them. Detail: the vps-dev-center-operations skill.
