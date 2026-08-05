## Klaily — klaily.co

Handmade clay plant/botanical earrings on Shopify. A **family business**: Chau
(Andy's sister, US) is the maker and the on-camera live-selling voice
(Palmstreet, ~$100k last year); Andy (Vietnam, ~12h offset) owns tech,
automation and marketing; parents (US) handle production and packaging.
Fulfilment is not the bottleneck — marketing bandwidth is.

### Stack

Custom Shopify Online Store 2.0 theme **"KLAILY 5.0"**, built fresh in
`klaily-theme/`, replacing a generic AI-assembled Craft homepage. Variant C
"Modern Editorial": square corners, olive `#586B47` / `#2C332F`, cream
`#EFECEC`; Trirong + Quattrocento Sans, self-hosted (no Google CDN). Native
cart drawer with cross-sell, volume-tier ladder and countdown; "Monthly Trio"
pick-3-of-N landing page for Instagram traffic. Checkout is native Shopify —
styling lives in the Checkout branding editor (profile 258605329), not the theme.

### Where the data lives

- Orders and revenue: Shopify admin, store `klaily`
- Social: Metricool (IG / FB / TikTok / YouTube / Pinterest)
- Code: private `github.com/digivisions/klaily`, branch `main`

### Live theme

**#184729796881**, published 2026-08-01 ("P0 trust + Trio countdown").
Historical: `184682250513` (related-products fix, 2026-07-29), `184006082833`
(original KLAILY 5.0).

### Standing rules

- Never push to the live theme without Andy's explicit per-action approval —
  `--allow-live`, an explicit theme path, and one `--only` flag per file.
- Content and social: **draft only**, never schedule or publish without approval.
- Write in Chau's maker-led voice. Never invent product stories or unsupported
  claims (an unsubstantiated "5,000+ Reviews" badge was removed for this reason).

### Current phase (2026-08)

P0 trust fixes and the Trio countdown are live. P1 fixes are planned on an
isolated copy of the live theme, **not** the local working tree (13+
pre-existing modified files). Open items: GitHub Actions deploy secrets
(`SHOPIFY_CLI_THEME_TOKEN`, `SHOPIFY_STORE`); flip `/pages/monthly-trio` to the
`trio` template; refresh stale monthly Trio copy; hard-coded `$` strings in the
PDP free-shipping line, announcement bar and `assets/trio.js`; real-device and
Lighthouse/CWV QA never run.

## Nguồn context

- Claude Code project memory: `~/.claude/projects/-Users-annguyen-Claude-Projects-Klaily/memory/` (7 notes)
- Repo: `/Users/annguyen/Claude/Projects/Klaily` (note: `Claude/Projects`, not `Claude-Projects`)
- Obsidian: `Projects/Klaily.md`
- Business docs: `docs/marketing-plan.md`, `docs/growth-strategy.{md,html,pdf}` in the repo
