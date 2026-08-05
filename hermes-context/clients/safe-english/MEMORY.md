Client "SAFE English" = Anh Ngữ An Toàn, a Vietnamese TOEIC-prep platform. The live site is anhnguantoan.com. Owner-operated language centre; students take online mock exams ("bộ đề") on the site. When Andy says "web", "bộ đề" or "bài thi" unqualified, he means anhnguantoan.com.
§
Stack: WordPress + Flatsome child theme + Elementor + MasterStudy LMS Pro, on Hostinger shared hosting, behind Cloudflare with LiteSpeed page cache. DB table prefix is preview_. Scale: ~113 exam sets, ~20k questions. Guest attempts get a private result link (expires 7 days); member results are permanent.
§
Where exam data lives: EVERY attempt (guest and member) writes one row to preview_stm_quiz_capture with created_at and a result_token. Today's attempt count = SELECT COUNT(*) FROM preview_stm_quiz_capture WHERE created_at >= CURDATE(). Same number is Telegrammed daily at 07:00 as "Bài thi hôm nay". Human view: WP Admin → "Nhật ký Online Testing" (admin.php?page=quiz-log-capture). Note "lượt thi" (attempts) ≠ distinct "bộ đề" attempted — if it matters, ask which one Andy means, never which website.
§
Client-error telemetry lives in preview_anta_client_log (types submit/audio/jserror/promise/ajax/media, 14-day retention). Read it FIRST for any student complaint about the exam. A server cron watchdog runs every 10 min and alerts the owner's Telegram; deliberately noise-tuned — don't casually retune it.
§
Standing rules: never deactivate WP All Import Pro or its ACF add-on — teachers import new bộ đề with it. Quiz and result routes must stay out of the page cache. Never test alerting by inserting fake telemetry rows — the live cron will page the owner. Full ops detail: safe-english-operations skill.
§
Current phase (2026-08): live operations healthy. An AMS (Academic Management System) proposal has been delivered — extend WordPress/MasterStudy with a modular event-driven plugin, NOT a rebuild — and awaits the client's approval. Build has not started; don't imply AMS work is underway.
