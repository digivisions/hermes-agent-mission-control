## Immersive Travel Asia (ITA)

Pan–Southeast Asia luxury travel brand; client project delivered by Digital
Visions.

- **WordPress staging (live):** https://staging-ita.digivisions.net
- **Planned launch domain:** immersivetravelasia.digivisions.net (DNS on Cloudflare)
- **Static Netlify demo:** retired — do not point anyone at it

> **Note:** `hermesProfile` for `immersive-travel-asia` is currently **null** in
> the client registry, so the profile seeder will skip this slug until a profile
> is provisioned. The same content is reused by the *project* of the same slug
> via a `SAME_AS` pointer.

### Design direction

"**1a Heritage**", chosen from a Claude Design project: jade / gold / cream
palette, Playfair Display + Source Sans 3.

### Stack

Custom WordPress **classic** theme `ita` + plugin `ita-core` — deliberately not
headless (decided 2026-07-23). ACF Pro is the only third-party plugin. CPTs:
Journey, Destination, Team, plus a private Enquiry. Taxonomies: Country (10) and
Travel Style (8), both with `query_var => false` so front-end `?country=` /
`?style=` filters do not collide with WP query vars. No form plugin — a
`template_redirect` handler with nonce + honeypot writes an Enquiry, sends
`wp_mail`, and PRG-redirects.

ACF field groups are registered in PHP (`acf_add_local_field_group`), not in the
DB — the admin Field Groups list looking empty is expected.

### Deploy model

Local WordPress is the source of truth → one clean `importWordpressWebsite` push
(needs an empty docroot) → iterate thereafter with `deployWordpressTheme`.
**Must-land logic lives in the theme**, because plugin deploys are unreliable on
this host.

### Standing rules

- Never declare the same PHP symbol in both theme and plugin — fatal redeclare,
  site-wide 500.
- Bump `ITA_THEME_VER` and clear the website cache after any asset change, or
  LiteSpeed serves stale CSS. Clearing the website cache does **not** clear
  opcache (1–3 min lag after deploy).
- Deploys never delete server files — retire a PHP file by redeploying an inert
  stub.

### Current phase (2026-08)

Staging is live and fully populated: 6 pages, 10 destinations, 18 journeys
(flagship *Vietnam North to South* fully built), 4 team members, 4 blog posts,
~98 media items. Theme at **v2.9.1** after a real 390×844 mobile-QA pass
(2026-08-01) — journey hero meta stacks on phones, destinations carousel arrows
hidden below 640 px, blog newsletter form fixed. Plugin `ita-core` at 1.1.0.

The 18 Vietnam journeys were verified page-reachable on 2026-07-29 (HTTP 200 +
matching title). That is reachability evidence, **not** editorial QA or launch
acceptance.

### Pending

ACF Pro license key (Andy to enter) · WebP delivery toggle (LiteSpeed) · srcset
on single-destination journey cards · About-dropdown labels vs section headings
· SMTP decision for reliable `wp_mail` · launch-domain migration, only after
staging acceptance.

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Volumes-DATA2-1-Development-Immersive/memory/` (8 notes; `ita-wordpress-deploy-gotchas.md` là bắt buộc đọc trước mọi lần deploy)
- Repo: `/Volumes/DATA2/1-Development/Immersive` — cần mount ổ ngoài DATA2
- Credentials: `ita-staging-credentials.md` trong thư mục dự án (không sao chép đi đâu)
- Nội dung khách gửi: `/Users/annguyen/Documents/Work & Business/Freelance/Immersive/Content updates`
- Obsidian: `Projects/Immersive Travel Asia.md`
