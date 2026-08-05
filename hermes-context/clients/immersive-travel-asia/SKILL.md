---
name: immersive-travel-asia-operations
description: Use for anything about Immersive Travel Asia (staging-ita.digivisions.net) — WordPress theme or plugin deploys, LiteSpeed cache and opcache, ACF fields, journeys/destinations/countries content, the itinerary import pipeline, enquiry forms, or a site-wide 500 on this build.
---

# Immersive Travel Asia — operations

## Architecture in one paragraph

A custom WordPress **classic** theme (`ita`) plus a plugin (`ita-core`) on
Hostinger, decided 2026-07-23 over a headless build. ACF Pro is the only
third-party plugin. CPTs: Journey, Destination, Team, plus a private Enquiry.
Taxonomies: Country (10) and Travel Style (8) — both set `query_var => false`
so the front-end `?country=` / `?style=` filters do not collide with WP query
vars. Local WordPress is the source of truth; the site is pushed once via a
clean import and iterated thereafter through theme deploys.

## Deploying — the part that bites

- **Theme deploys DO update in place.** The `ita-XXXX` temp directory and
  `activated:false` in the response are noise, not failure.
- **Plugin deploys are unreliable.** They upload to a suffixed temp directory,
  always 422 on activation, and only sometimes sync. Root cause: the *active*
  plugin folder is `ita-core-old-6a6247da133a0/`, not `ita-core/` — deploys
  were writing to an inactive slug. **Put must-land logic in the theme.**
- **Bump `ITA_THEME_VER` on every asset change and clear the website cache**, or
  LiteSpeed and browsers serve stale CSS. "Still broken on my phone" is usually
  a stale cache, not a wrong fix — verify the live HTML references the new
  `?ver=`.
- **PHP opcache lags 1–3 minutes** after a deploy; different PHP-FPM workers
  serve old and new code meanwhile. Verify with a marker string in the page
  source, not one screenshot. Clearing the website cache does **not** clear
  opcache.
- **Deploys never delete server files.** Retire a PHP file by redeploying it as
  an inert stub.
- A full re-push requires `importWordpressWebsite`, which needs an **empty
  docroot**. Deleting a subdomain does not wipe its files — recreate it pointing
  at a *new* directory name.
- The REST / application-password route is dead on this host: LiteSpeed strips
  the Authorization header.

## The two fatal ones

1. **Never declare the same PHP symbol in both theme and plugin.** `Cannot
   redeclare` is a fatal error and the whole site 500s.
2. Hostinger once auto-injected an incompatible `ai-provider-for-anthropic`
   plugin after an import, causing a site-wide 500. It was deleted — watch for
   re-injection after any import.

## ACF quirks on this build

- Field groups are registered in PHP via `acf_add_local_field_group`, not stored
  in the DB. The admin Field Groups list looking empty is expected.
- Fields are not exposed to REST here — verify values through the front end.
- `default_value` on a select is unreliable until a real save.
- `update_field()` on repeaters needs field *names* and attachment IDs.
- `true_false` renders a hidden `value=0` input before the checkbox.

## Other WordPress notes

- A fresh-import DB had an empty `permalink_structure`, giving plain URLs only.
  The seeder now bakes in `/%postname%/`.
- Seeding pattern: guarded one-time `admin_init` seeders keyed on an option
  (e.g. `ita_home_seed_done`). Re-seed by deleting the guard option. They fire
  only when an admin loads wp-admin.
- Use `wp_add_inline_script(..., 'before')` with JSON, not `wp_localize_script`
  — the latter stringifies booleans and numbers.
- `welcome_panel` is hidden per-user by default; force it visible in admin CSS.

## Content and the itinerary pipeline

Client `.docx` itineraries are parsed into structured data by a local
`ita-pipeline/` toolkit and loaded through the importer plugin, which also
carries purge / signature / country actions. Image selection runs through a
**fail-closed gate**: country, place and subject evidence required; no maps, no
AI art, no wrong-country imagery, and uniqueness checked against prior batches.

Demo journeys were purged — priced journeys were the demo ones. Multi-country
journeys and hero-meta filtering are supported. Eighteen Vietnam journeys are
loaded and page-reachable on staging (verified 2026-07-29 by HTTP 200 + matching
title). That is **reachability evidence, not editorial QA or launch acceptance**
— say so if asked whether they are done.

## Verification techniques that work here

- The browser automation window is locked near 1440 px. To check a real 390 px
  phone viewport, use a same-origin iframe with a cache-busted `src`; do not
  `eval()` a large fetched script (it freezes the renderer) — inject it as
  `<script src>`.
- "Pixelated images" was a display-size bug — a small crop stretched into a huge
  retina box. Measure `naturalWidth` against rendered `width × devicePixelRatio`
  before blaming the source files.
- Plugin activation and content entry cannot be fully automated: browser
  automation cannot type passwords, so activation needs Andy's wp-admin clicks.

## Open items

ACF Pro license key (Andy to enter), WebP delivery toggle in LiteSpeed, srcset
on single-destination journey cards, About-dropdown labels vs section headings,
an SMTP decision for reliable `wp_mail`, and the eventual move to the launch
domain (Cloudflare DNS, grey-cloud A record) — only after staging acceptance.

## Reading more

WP admin and DB credentials live in a project file on Andy's Mac and are never
copied elsewhere, including here. The full build plan and the deep deploy notes
are on the Mac too. If a question needs them, ask Andy or route it through the
Claude Code offload.
