## MOVE Fitness (MoveVN) — id.movevn.com

Booking and operations platform for MOVE Fitness, a pilates/cycle studio group
in Vietnam, built and operated by Digital Visions.

- **Production:** https://id.movevn.com
- **Staging:** https://staging.movevn.com
- **Marketing site:** https://movevn.com
- **Repo:** `github.com/digivisions/id.movevn.com`

### Stack

Laravel backend + React/Vite web dashboard + Expo React Native mobile app,
running as a Docker Compose stack (production + staging) on a single VPS
(`72.62.250.107`).

Containers and volumes use `-prod` / `-staging` — **never `-production`**:
`laravel-prod`, `queue-worker-prod`, `scheduler-prod`, `mysql-prod`,
`nginx-prod`, `redis-prod`. Code is served from named volumes, not the image.
`nginx-prod` is the edge for both domains (binds 80 + 443). Production DB is
`movedb` (not `movedb_prod`); staging is `movedb_stage`.

### Deploys

Production ships from the dedicated `production` branch via a manual
"CD - Deploy to Production" workflow. `main` is stale and diverged — never
deploy it. Always restart queue workers after a deploy. A green workflow does
not prove the right code shipped: verify the image's
`org.opencontainers.image.revision` label.

### 2026 workstreams

Booking policy and cancellation rules, the trainer payroll engine, off-peak
memberships, waitlist promotion, the in-app notifications inbox, and heavy
CI/CD + VPS reliability work.

### Monitoring

Prometheus / Grafana / Alertmanager / Loki at `/opt/movevn/monitoring` on the
VPS — config is **not** in the repo. Email alerts via Resend + blackbox
`SiteDown` probes. Pending: Slack webhook, off-box monitor, closing Grafana's
public :3000.

### Standing rules

- Never use real client emails for testing — only the four whitelisted accounts.
- Production 500s with an **empty** `laravel.log` mean a storage write-permission
  problem, not an app bug.
- Secrets leaked in git history are **still unrotated** — top open security item
  across three consecutive audits.

### Current phase (as of 2026-07-28)

Production is live and healthy; all agreed requirements are delivered. Status is
**waiting on customer payment** — administrative closure, not engineering. Treat
any new request as separately scoped work rather than unfinished delivery.

### Open items

Rotate the git-history secrets (critical); Ride bonus default 10k vs the card's
15k (informational); queue-architecture inconsistency (default connection is
redis, drained only by the scheduler's per-minute `queue:work --once`, while the
dedicated worker runs `database`); thumbnail URL 404s in `PostPicker.tsx` /
`ThumbnailPicker.tsx`; UI issues — booking dialog loop after success, stale
policy text, QR still shown after cancellation.

### ⚠️ Cần Andy xác nhận

Spec I §9.6 nói `id.movevn.com` dùng chung tài khoản Hostinger shared hosting
với `anhnguantoan.com`, và cron của MOVE làm chậm trang thi của ANTA. Tất cả
nguồn hiện tại của MoveVN đều mô tả một **VPS Docker riêng**, và project memory
ghi rõ host Hostinger cũ đã **chết**, script đồng bộ đã lỗi thời. Vì mâu thuẫn
này, thông tin "chung hosting" **không** được nạp vào memory của cả hai client.
Anh xác nhận giúp trước khi ai đó chẩn đoán sự cố theo hướng "hàng xóm chung
server".

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Users-annguyen-Downloads-MoveVN-id-movevn-com/memory/` (26 notes — thư mục memory vẫn giữ tên slug cũ `Downloads`)
- Repo: `/Users/annguyen/Documents/1-Development/MoveVN/id.movevn.com` (đường dẫn `Downloads/MoveVN` đã **không còn tồn tại**)
- Hồ sơ kinh doanh: `/Users/annguyen/Documents/1-Development/MoveVN/` (Design & Assets, Quotations & Contracts, Requirements & Policies, db-backups, rate-card xlsx)
- Obsidian: `Projects/MoveVN.md`
