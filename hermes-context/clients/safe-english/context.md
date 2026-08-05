## SAFE English (Anh Ngữ An Toàn) — anhnguantoan.com

Vietnamese TOEIC-prep platform. Owner-operated language centre; students take online mock exams ("bộ đề") on the site. When Andy says "web", "bộ đề" or "bài thi" with no other qualifier, he means anhnguantoan.com.

### Stack

WordPress + Flatsome child theme + Elementor + MasterStudy LMS Pro, on Hostinger shared hosting, behind Cloudflare with LiteSpeed page cache. DB table prefix is `preview_`. Scale: ~113 exam sets, ~20k questions. Guests are first-class: a guest attempt gets a private result link that expires after 7 days; member results are permanent.

### Where exam data lives

Every attempt (guest and member) writes one row to `preview_stm_quiz_capture` with `created_at` and a `result_token`. Today's attempt count = `SELECT COUNT(*) FROM preview_stm_quiz_capture WHERE created_at >= CURDATE()`. Same number is Telegrammed daily at 07:00 as "Bài thi hôm nay". Human view: WP Admin → "Nhật ký Online Testing" (`admin.php?page=quiz-log-capture`). Note "lượt thi" (attempts) is not the same as distinct "bộ đề" attempted.

### Client-error telemetry

Lives in `preview_anta_client_log` (types submit/audio/jserror/promise/ajax/media, 14-day retention). Read it first for any student complaint about the exam. A server cron watchdog runs every 10 min and alerts the owner's Telegram; it is deliberately noise-tuned.

### Standing rules

Never deactivate WP All Import Pro or its ACF add-on — teachers import new bộ đề with it. Quiz and result routes must stay out of the page cache. Never test alerting by inserting fake telemetry rows — the live cron will page the owner.

### Current phase (2026-08)

Live operations healthy. An AMS (Academic Management System) proposal has been delivered — extend WordPress/MasterStudy with a modular event-driven plugin, NOT a rebuild — and is waiting on the client's approval. Build has not started.

## Nguồn context
- Claude Code project memory: `~/.claude/projects/-Volumes-DATA2-1-Development-Anh-Ngu-An-Toan/memory/` (10 notes)
- Repo: `/Volumes/DATA2/1-Development/Anh Ngu An Toan/anhnguantoan-dev`
- Obsidian: `Projects/Anh Ngu An Toan.md`
- Hồ sơ khách hàng: `~/Documents/1-Development/anhnguantoan/`
