## CHUBB Dev — CHUBB APAC Development Toolkit

> ⚠️ **Confidential by default.** This is Andy's day-job engineering work at
> CHUBB APAC — his employer's work, **not** a Digital Visions client
> engagement. The agent is instructed never to volunteer CHUBB detail in an
> unrelated thread and never to repeat production configuration or credentials.

Hermes profile for this client is **`chubb-apac`** (not `chubb-dev`).

### What it is

A toolkit supporting CHUBB's Asia-Pacific marketing operations. Primary use
cases: UTM parameter generation, website auditing, form management, sitemap
analysis, SEO auditing and content extraction.

1. **SEO Dashboard (PHP/MySQL)** — production web app at `seo.digivisions.co`
2. **Python scripts** — local analysis and audit tooling
3. **HTML tools** — UTM generators and browser utilities

### Stack

- Dashboard: PHP 7.4+ with Composer (Guzzle HTTP, PhpSpreadsheet, TCPDF),
  MySQL 8.0, Tailwind CSS + Font Awesome + vanilla JS, Hostinger shared hosting
- Local tooling: Python 3.9 in `.venv/` — pandas, openpyxl, requests,
  BeautifulSoup4, lxml, `concurrent.futures`

### Audit types available

Broken links, SEO meta, security headers, PageSpeed performance, redirect
chains, images — each a `BaseAuditor` subclass in `classes/` with a matching
endpoint in `api/audits/`. Excel and PDF export; audit history in MySQL.

### Standing rules

- The repository working tree is enormously dirty — around **35,000 tracked
  change entries**, much of it an accidentally tracked `#/` tree. Never reset,
  clean, discard or mass-stage it. Inspect git narrowly, file by file.
- Verify production state separately before any deploy or live-data operation.
- APAC locale counts and operational details drift — check the live project
  instructions rather than quoting a remembered number.
- Production configuration and credentials stay outside this knowledge base.

### Current phase

Active, and Andy's default day-to-day work context unless he names another
project. Canonical path was corrected 2026-07-28 — the historical
`~/Documents/CHUBB-Dev` location is obsolete.

## Nguồn context

- Repo + CLAUDE.md: `/Users/annguyen/Documents/Work & Business/CHUBB Dev`
- Obsidian: `Projects/CHUBB Dev.md`
- Không có Claude Code project memory cho slug này — context lấy từ CLAUDE.md và Obsidian.
