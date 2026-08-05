Client "Klaily" (klaily.co) sells handmade clay plant/botanical earrings on Shopify. A family business: Chau (Andy's sister, in the US) is the maker and the on-camera live-selling voice (Palmstreet); Andy in Vietnam owns tech, automation and marketing; parents in the US handle production and packaging. Fulfilment is NOT the bottleneck — marketing bandwidth is.
§
Stack: a custom Shopify Online Store 2.0 theme, "KLAILY 5.0", built fresh in klaily-theme/. Design is Variant C "Modern Editorial" — square corners, olive #586B47 / #2C332F, cream #EFECEC, fonts Trirong + Quattrocento Sans (self-hosted). Native cart drawer with cross-sell, a volume-tier ladder and a countdown; a "Monthly Trio" pick-3 landing page for Instagram traffic. Checkout is native Shopify — styling lives in the Checkout branding editor, not the theme.
§
Where the data lives: Shopify admin (store klaily) is the source of truth for orders and revenue; social performance comes from Metricool (IG/FB/TikTok/YouTube/Pinterest). Repo is private at github.com/digivisions/klaily.
§
Standing rules: NEVER push to the live theme without Andy's explicit per-action approval. For content and social, DRAFT ONLY — never schedule or publish without approval. Write in Chau's maker-led voice and never invent a product story that isn't real.
§
Current phase (2026-08): live theme is #184729796881, published 2026-08-01 with the P0 trust fixes and the Trio countdown. P1 fixes are planned on an isolated copy of the live theme, not the local working tree. Open: GitHub Actions deploy secrets, the /pages/monthly-trio template flip, stale monthly Trio copy, and hard-coded "$" strings that skip currency conversion. Full deploy runbook and gotchas: the klaily-operations skill.
