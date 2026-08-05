## andynguyen.work

Andy Nguyen's public portfolio site — the personal-brand layer for Digital
Visions' founder. Built as a static site with a Strapi CMS alongside and a
Vietnamese locale under `vi/`.

Location: `/Users/annguyen/Documents/1-Development/Portfolio` (this was
`location: null` in the project registry until Spec I; now backfilled and
verified to exist).

**Positioning: AI automation, digital systems and technical leadership.** Site
taglines: *"Make your operations run better with practical AI"* · *"Built for
production, not demos"*. **It is not an ecommerce site** and must never be
described as one.

### Case-study hierarchy

**Flagship:** MOVE Fitness VN (movevn.com) — booking + membership platform;
80+ packages simplified to a three-tier offer; ~6,100 HTTP requests/day.

**Featured pair:**

- **Klaily** (klaily.co) — Shopify storefront rebuilt as a custom "Modern
  Editorial" theme, extended into a marketing-automation engine. 0 Theme Check
  offenses + a scheduled content workflow.
- **Immersive Travel Asia** — AI-assisted brand build and content delivery;
  Claude Design "Heritage" → approved static demo → custom WordPress theme +
  plugin, with a fail-closed image gate. 88 itineraries loaded on staging.

**Additional delivery (compact entries):** AutoX Lubricants · Line Pilates
Vietnam · Blu Creative · Amalafox · Tam & Nang RSVP.

**Lab / R&D (not client work):** Echo · AndyPi · Local Voice AI · Local LLM
Fleet · physical prototyping & G-code engineering.

**Background only:** CHUBB APAC (WCAG 2.0 AA, SharePoint tooling, multi-market
content audits) — never presented as a Digital Visions client engagement.

> ⚠️ **Deviation from Spec I §7.6.** The spec's hand-written text named "Klaily
> and AutoX Lubricants" as the secondary featured pair, with Line Pilates and
> Blu Creative as compact entries. The live `index.html` and `llms.txt` both
> show **Immersive Travel Asia**, not AutoX, in the featured pair, with AutoX
> demoted to the compact grid. The seeded content follows the live site.

### Four service lines

Operational AI (workflow automation with guardrails, approvals, visibility) ·
Private AI (local/on-premise for privacy, cost or control) · Digital systems
(sites, commerce, internal tools, infrastructure) · Fractional technical
leadership.

Method: discovery → architecture → build in short visible iterations → handover,
with the client owning code, infrastructure and operational knowledge.

### Structure

`index.html` · `vi/index.html` · `assets/` · `studio.html` · `sitemap.xml` ·
`robots.txt` · favicons · `strapi/` (content-type definitions + VPS notes).
Section anchors: `about`, `process`, `lab`, `notes`, `contact`, `more-grid`.

### Standing rules

- **Keep `llms.txt` in sync** whenever the case-study list, positioning or
  contact details change — it is what an AI reading the site will quote, and a
  stale copy produces confidently wrong summaries of Andy's work.
- Hold the AI-systems positioning; do not let copy drift toward generic
  web-agency language.
- Every case study is framed problem → what was built → a concrete, verifiable
  result. Don't add unsubstantiated results, and don't soften existing ones.
- Contact details (`info@digivisions.net`, `linkedin.com/in/andynguyen88`, the
  15-minute booking link) must stay consistent across `index.html`,
  `vi/index.html` and `llms.txt`.

## Nguồn context

- Thư mục site: `/Users/annguyen/Documents/1-Development/Portfolio` (đã xác minh tồn tại, 2026-08-05)
- `llms.txt` ở gốc site — bản tóm tắt định vị + toàn bộ case study, dùng làm nguồn đối chiếu
- **Không có** repo riêng có CLAUDE.md, Obsidian note hay Claude Code memory. Nội dung viết tay theo Spec I §7.6, đã đối chiếu và sửa lại theo `index.html` + `llms.txt` thực tế.
