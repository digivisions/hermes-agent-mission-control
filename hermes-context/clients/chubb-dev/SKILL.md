---
name: chubb-dev-operations
description: Use for anything about Andy's CHUBB APAC work — the seo.digivisions.co SEO dashboard, APAC website audits (links, meta, security headers, PageSpeed, redirects, images), UTM generators, sitemap and form analysis, content extraction, or the toolkit's Python scripts.
---

# CHUBB APAC Development Toolkit — operations

## Confidentiality first

This is Andy's employer's work, not a Digital Visions client project. Before
answering anything here:

- Do not surface CHUBB material in a thread about another client or project.
- Do not name internal systems, markets or stakeholders unprompted.
- Production configuration and credentials stay out of every answer, every
  note, and every knowledge base — including this one.
- If a request would put CHUBB detail somewhere it does not already live, ask
  Andy first.

## What the toolkit contains

Three components, one repository:

1. **SEO Dashboard (PHP/MySQL)** — a *production* web application at
   `seo.digivisions.co`. PHP 7.4+ with Composer dependencies (Guzzle HTTP,
   PhpSpreadsheet, TCPDF), MySQL 8.0, Tailwind CSS + Font Awesome + vanilla JS,
   on Hostinger shared hosting.
2. **Python scripts** — local development and analysis tools. Python 3.9 in a
   `.venv/`; pandas, openpyxl, requests, BeautifulSoup4, lxml,
   `concurrent.futures`.
3. **HTML tools** — browser-based utilities, principally UTM generators.

Primary use cases across all three: UTM parameter generation, website auditing,
form management, sitemap analysis, SEO auditing, and content extraction.

## Dashboard shape

Under `seo-dashboard-php/`:

- Entry points: `index.php` (dashboard), `login.php` / `logout.php`,
  `error.php`; `.htaccess` carries the Apache security config.
- `api/` — `health.php`, `locales.php`, `stats.php`, `history.php`, plus
  `api/audits/` (`links`, `seo-meta`, `security`, `performance`, `redirects`,
  `images`) and `api/exports/` (`excel.php`, `pdf.php`).
- `includes/` — `config.php` (database + app config), `db.php` (PDO wrapper),
  `auth.php` (session authentication), `functions.php`.
- `classes/` — `BaseAuditor` (abstract base) with `SitemapParser`,
  `LinkChecker`, `SeoMetaAuditor`, `SecurityAuditor`, `PerformanceChecker`
  (PageSpeed API), `RedirectChecker`, `ImageAuditor`, and `ExportGenerator`.
- `sql/schema.sql` holds the MySQL schema; generated reports land in
  `reports/excel/` and `reports/pdf/`; application logs in `logs/`.

A new audit type is a `BaseAuditor` subclass in `classes/` plus a thin endpoint
in `api/audits/` — follow the existing pair rather than inventing a new shape.

## The dirty repository — the one rule that matters

Git status has reported on the order of **35,000 tracked change entries**, a
large share of which is an accidentally tracked environment-like `#/` tree.

- **Never** `git reset`, `git clean`, `git checkout --` a broad path, or
  `git add -A` here.
- Inspect narrowly: name the exact files the task touches and diff only those.
- Separate intentional project work from the `#/` tree *before* editing source.
- Untangling the tree is its own approved task, not a side effect of another one.

## Before touching production

`seo.digivisions.co` is live. Verify its current state independently before any
deploy or live-data operation — the local tree is not a reliable picture of
what is deployed. APAC locale counts and operational details drift; read the
live project instructions rather than quoting a remembered figure.

## Reading more

The project's own `CLAUDE.md` and the working files live on Andy's Mac, not in
this container. If a question needs them, ask Andy or route it through the
Claude Code offload.
