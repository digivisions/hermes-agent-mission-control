---
name: move-fitness-operations
description: Use for anything about MOVE Fitness / MoveVN (id.movevn.com, staging.movevn.com) — deploys and CI/CD, the Docker stack on the VPS, payroll and bonus eligibility, booking and cancellation policy, waitlists and notifications, monitoring and alerting, database schema quirks, or debugging a production incident.
---

# MOVE Fitness / MoveVN — operations

## The stack, precisely

One VPS, Docker Compose in `/opt/movevn/{production,staging}`.

| Role | Staging | Production |
|---|---|---|
| Laravel / PHP-FPM | `laravel-staging` | `laravel-prod` |
| Queue worker | `queue-worker-staging` | `queue-worker-prod` |
| Scheduler | *(none)* | `scheduler-prod` |
| MySQL | `mysql-staging` | `mysql-prod` |
| Nginx | `nginx-staging` | `nginx-prod` |
| Redis | `redis-staging` | `redis-prod` |

Volumes follow the same rule: `laravel-prod-code`, `laravel-prod-storage`,
`mysql-prod-data`, `redis-prod-data`. **`-prod`, never `-production`.**

- Production DB is `movedb`; staging is `movedb_stage`.
- Runtime env edits go in `.env.{APP_ENV}` **inside the code volume** — the
  bind-mounted `.env` is ignored.
- `nginx-prod` is the edge for both domains and binds 80 + 443.
- Production artisan: `docker exec -u www-data laravel-prod php artisan …`
- Tinker on the server needs root and `-e HOME=/tmp`, plus fully-qualified class
  names (a `use` statement piped through stdin does not apply).
- `php artisan test` is unavailable on staging — it runs the production image.

## Release flow

1. Merge `develop` → `production`, push.
2. Run **"CD - Deploy to Production"** (`workflow_dispatch`) with branch `production`.
3. Verify the deployed image's `org.opencontainers.image.revision` label matches
   the branch HEAD. **A green workflow does not prove the right code shipped.**
4. Restart and verify the queue workers.

Failed "Test SSH connection" / "Test database connection" steps are usually
transient runner→server timeouts — check the server before reacting.

Process rule Andy has stated explicitly: for any CI/CD problem, **audit the whole
pipeline and land one consolidated fix**. No iterative deploy-fail-fix loops.
Protect the live database.

## Production incidents worth knowing

- **Empty `laravel.log` + 500s = storage write permissions.** The 2026-07-05
  total booking outage was PHP-FPM running as `www` (uid 1000) against
  `www-data` (33) storage, after a compose recreate silently rebuilt the image
  from a legacy Dockerfile. The `build:` key was deleted from the prod compose
  file. Prefer `docker update --memory` over a compose recreate for live limit
  changes. After any image→volume code copy: `chown -R 33:33` + `chmod a+rX`,
  or nginx returns "No input file specified" 404s.
- **A stray host systemd nginx grabs :80 on reboot** and takes both sites down
  by crash-looping `nginx-prod`. It must stay `systemctl disable`d.
- **Deploy-script leaks fill the disk** — `docker create` under `set -e` without
  a trap leaked a container per failed run (disk hit 82%). Fixed with an EXIT
  trap plus a weekly prune cron.
- **Staging MySQL must run UTC.** Datetime columns are TIMESTAMP and are read in
  the DB session timezone; a `+07:00` session made staging times read +7h.
  Diagnose "7h off on staging only" here — do not touch data or app code.
- `AuthController: refresh failed` at ~16–35/day in prod logs is known baseline
  noise, not an incident.

## Monitoring

Prometheus / Grafana / Alertmanager / Loki at `/opt/movevn/monitoring` on the
VPS — **the config is not in the repo**. Email alerts via Resend plus blackbox
`SiteDown` probes work. Pending: Slack webhook, an off-box monitor, and closing
Grafana's public :3000.

- A `MySQLDown` alert while the site works = exporter DB-user auth drift, not
  MySQL down.
- `ContainerDown` via cadvisor names is broken on this host (cgroup v2) and was
  neutralised.

## Payroll

- Per-trainer base rates live in `trainer_academic_classes`, imported with
  `payroll:import-ratecard` from the base-rate spreadsheet.
- Class-type defaults live in `class_type_pay_settings`.
- Bonus eligibility is computed by `BonusEligibility` and mirrored into
  `class_session_user.apply_bonus`. Default is OFF for trials, drop-ins, comps,
  VIP and soft-deleted subscriptions; ON for real memberships.
- The 2026-07-08 client report of an "inconsistent Apply bonus toggle" was a
  missing production backfill after go-live, fixed by
  `payroll:backfill-apply-bonus` (31,585 rows). Behaviour is by design, not a bug.

## Booking policy

- Activation date `2026-02-02` (`config/app.php` + `BOOKING_POLICY_ACTIVATION_DATE`).
- Users cannot cancel within 4 hours of session start; **admin bypass is intentional**.
- Late cancellation sets `late_cancel=true` and keeps `status='active'`.
- Normal cancellation sets `status='cancelled'`.

## Notifications

The in-app inbox uses Laravel's `database` channel with a UUID `notifications`
table, API under `/api/notifications`, and a bell in both the customer and admin
layouts. Push opt-out is `users.push_notifications_enabled`. Of the three trainer
push jobs, only real-time booking/cancel is kept on production; session-reminder
and weekly-schedule were disabled 2026-07-11. `APP_TIMEZONE=UTC` means a
`weeklyOn` at 20:00 UTC fires at 03:00 local — check this before scheduling.

## Schema traps

- `sessions` uses `start_time`, not `date`.
- `class_session_user` uses `session_id` and `check_in_token` (not `qr_token`).
- `subscriptions.sessions_used` is deprecated — use the `active_sessions_used` accessor.
- `users` uses `display_name`, not `name`.
- `waiting_lists` uses `has_applied` (0=pending, 1=applied, 2=skipped), not `status`.

## API quirks

- Login requires `Content-Type: application/x-www-form-urlencoded`, not JSON.
- Booking: `POST /api/user/sessions`, with `policy_accepted_at` in the form body.
- Cancel: `policy_accepted=1` as a **query parameter**.
- For staging API tests, mint a JWT directly rather than relying on passwords.

## Standing security rules

- **Never use real client emails for testing.** Only the four whitelisted test
  accounts are permitted. Credentials live in Claude Code project memory on
  Andy's Mac — never copy them anywhere, including into a chat reply.
- **Secrets committed to git history are still unrotated.** This has been the top
  finding of three consecutive audits. Gitignoring or archiving a file does not
  remove the secret from history — verify any "fixed" claim with
  `git show <commit>:<path>`, and do not trust a sub-agent's word for it.

## Note for Andy — an unresolved discrepancy

Spec I §9.6 states that `id.movevn.com` and `staging.movevn.com` share a
Hostinger shared-hosting account (and one CloudLinux LVE slice) with
anhnguantoan.com, and that MOVE's schedulers degrade ANTA's quiz pages. Every
current MoveVN source instead describes a dedicated Docker VPS, and the project
memory records the old Hostinger host as **dead** with its sync scripts
obsolete. Treated as stale; not seeded as fact into either client's memory.
Confirm before anyone acts on a "shared neighbour" diagnosis.

## Reading more

The per-incident history, credentials and audit reports live in Claude Code
project memory and the repo on Andy's Mac, not in this container. If a question
needs them, ask Andy or route it through the Claude Code offload.
