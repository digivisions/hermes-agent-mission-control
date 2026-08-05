---
name: safe-english-operations
description: Use for anything about anhnguantoan.com (Anh Ngữ An Toàn / SAFE English) — exam counts and reports, student exam complaints, the mock-test watchdog, deploys, LiteSpeed cache, bộ đề imports, or the AMS proposal.
---

# SAFE English / anhnguantoan.com — operations

## Counting exams

- Attempts today: `SELECT COUNT(*) FROM preview_stm_quiz_capture WHERE created_at >= CURDATE();`
- Distinct sets attempted today: add `COUNT(DISTINCT quiz_id)`.
- On the server: `wp db query "…"` from the web root. Times in these tables are **UTC** — a "today" question asked late in the Vietnam evening can straddle the boundary; say so if it matters.
- Same figure is already reported daily at 07:00 to the owner's Telegram by the watchdog's digest.
- WP Admin equivalent: **Nhật ký Online Testing** → `admin.php?page=quiz-log-capture`. It lists capture rows and client-error telemetry side by side.

## Student exam complaints — order of investigation

1. `preview_anta_client_log` (types: submit / audio / jserror / promise / ajax / media; 14-day retention; 30/hour/IP rate limit).
2. `preview_stm_quiz_capture` for the same IP/time window — a submit error with a capture row was **rescued** by the guest fallback endpoint (`admin-ajax action=anta_submit_fallback`) and is not a real failure.
3. Only then look at the exam page itself. A logged-in admin sees the *attempt* view, not the fresh form — test guest flows in incognito.

## Known-open issue

Cloudflare WAF returns a deterministic 403 on `POST /wp-admin/admin-ajax.php` for the native `stm_lms_user_answers` action (reproduced 3/3; origin logs are clean). The guest fallback covers all current exam-takers, so nothing is on fire, but the native path stays broken until a WAF Skip rule is added in the owner's Cloudflare dashboard.

## The watchdog

Runs every 10 minutes; alerts on unrescued submit errors, audio/media spikes (requires spread across ≥5 IPs, not one flaky student), jserror/promise volume, quiz-page 404s across ≥3 IPs, plus active probes of the listing page, a canary quiz and one audio file. Per-type cooldown 30–60 min.

- **Test with dry-run only.** A real run stamps the cooldown and would mute the next genuine alert.
- **Never seed synthetic rows into the telemetry table to test it.** The live cron will page the owner with your fake data. This has already happened once.
- Thresholds are constants at the top of the script; the tuning behind each one is deliberate (see the repo's memory notes). Do not relax them to make an alert go away.

## Deploy / cache

- LiteSpeed page cache must be **active**. Quiz (`/kiem-tra/`) and result (`/ket-qua/`) routes are excluded from caching and must stay excluded.
- After any change to the exam JS or templates, purge LiteSpeed. This is not optional — quiz HTML is page-cached.
- The MasterStudy Pro online-testing template is hand-customised. A plugin update overwrites it; re-deploy from the repo afterwards.

## Imports

Teachers add new bộ đề with **WP All Import Pro + the ACF add-on**. Both must stay active. A quarantine gate blocks broken bộ đề from reaching students, with a daily sweep. A newly imported set that renders "0/0" is usually missing its Part taxonomy terms — verify by actually starting the quiz, not by grepping the page HTML.

## Commercial status

An AMS (Academic Management System) proposal has been delivered: extend the existing WordPress/MasterStudy install with a modular, event-driven plugin rather than rebuilding. Phased, ~20–24 weeks. **Awaiting the client's approval — do not quote figures or discuss timelines as agreed work.** Design invariants if it proceeds: freeze answer/correctness/content at submit; mint stable, edit-proof question keys before any mass labelling; taxonomy and error tagging belong to the centre's staff, not to AI; test foundation changes on a DB copy, never live.

## Reading more

The deep notes (live-ops runbook, watchdog history, import quirks, audio-stall fix, backward-nav rule, AMS audit) live in Claude Code project memory on Andy's Mac, not in this container. If a question needs them, ask Andy or route it through the Claude Code offload.
