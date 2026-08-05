---
name: andynguyen-work-operations
description: Use for anything about andynguyen.work, Andy's portfolio site — the case-study list and its hierarchy, positioning and copy, the Lab section, the Vietnamese locale, the Strapi CMS alongside it, or keeping llms.txt in sync.
---

# andynguyen.work — operations

## What this site is for

The personal-brand layer for Digital Visions' founder, and a deliberate
strategic asset feeding the LinkedIn / portfolio funnel — not a hobby page. It
was written with heavy AI assistance.

**Positioning: AI automation, digital systems and technical leadership.** The
site's own taglines are *"Make your operations run better with practical AI"*
and *"Built for production, not demos"*. Fifteen-plus years across enterprise
IT, production web systems and technical delivery in Vietnam and APAC.
Delivered via DigiVisions Consulting, Ho Chi Minh City.

**It is not an ecommerce site.** Never describe it as one.

## Case-study hierarchy — get this order right

**Flagship:**

- **MOVE Fitness VN** (movevn.com) — booking + membership platform for a
  multi-format studio. Simplified 80+ confusing packages into a three-tier
  offer; led deployment, backend infrastructure and feature development. Result
  framing: a live platform serving ~6,100 HTTP requests/day across Ride, Hybrid
  and Reformer Pilates.

**Featured case studies:**

- **Klaily** (klaily.co) — rebuilt an underperforming Shopify storefront as a
  custom "Modern Editorial" theme, then extended it into a marketing-automation
  engine. Result framing: Shopify Theme Check with 0 offenses plus a scheduled
  content workflow that runs without manual coordination.
- **Immersive Travel Asia** — AI-assisted brand build and content delivery for a
  pan–Southeast Asia luxury travel platform. Claude Design "Heritage" direction
  → client-approved static demo → full custom WordPress theme + plugin. Built an
  iterative content pipeline with a fail-closed image gate. Result framing: 88
  itineraries loaded on staging across every country covered, each with verified
  imagery, plus a documented reusable workflow for handover.

**Additional delivery experience (compact entries):** AutoX Lubricants (Swiss
brand, four-language rollout), Line Pilates Vietnam (multi-studio web
infrastructure), Blu Creative (agency-wide web and IT, zero-downtime client
migrations), Amalafox (ecommerce storefront), Tam & Nang RSVP (bilingual
serverless wedding app).

**Lab / R&D — not client case studies:** Echo (the pocket voice recorder),
AndyPi (the home lab), Local Voice AI, Local LLM Fleet, and physical
prototyping / G-code engineering.

**Background only:** CHUBB APAC appears in the background text (WCAG 2.0 AA
compliance, SharePoint tooling, multi-market content audits) — never as a
Digital Visions client engagement.

## The four service lines

1. **Operational AI** — mapping repetitive workflows across CRM, email,
   documents, ERP, chat and internal tools, then building dependable automation
   with guardrails, approvals and visibility.
2. **Private AI** — local and on-premise systems for teams with privacy, cost or
   control requirements: local inference, voice workflows, retrieval,
   human-in-the-loop.
3. **Digital systems** — customer-facing websites, commerce, internal tools and
   the infrastructure beneath them.
4. **Fractional technical leadership** — architecture, vendor selection, AI
   adoption priorities, delivery plans, and the trade-offs behind each.

The stated method is four steps: discovery → architecture → build in short
visible iterations → handover, with the client owning the code, infrastructure
and operational knowledge.

## Build and structure

- A static site: `index.html` at the root, a Vietnamese locale under `vi/`, an
  `assets/` directory, `studio.html`, a `sitemap.xml`, `robots.txt` and the
  usual favicon set.
- A **Strapi CMS** sits alongside it in `strapi/` (content-type definitions plus
  VPS notes).
- Page sections are anchored by id — `about`, `process`, `lab`, `notes`,
  `contact`, plus a `more-grid` for the compact entries.

## llms.txt — keep it in sync

There is an `llms.txt` at the site root summarising positioning, service lines,
every case study, the Lab, background and contact details. **It is what an AI
reading the site will quote.** Whenever the case-study list, the positioning or
the contact details change, update `llms.txt` in the same change — a stale
`llms.txt` produces confidently wrong summaries of Andy's work.

## Copy guidance

Hold the AI-systems positioning. The failure mode to avoid is drift toward
generic web-agency language ("we build beautiful websites"). Every case study is
framed as **problem → what was built → a concrete result**, and the results are
specific numbers or verifiable states. Do not add a result claim that cannot be
substantiated, and do not soften an existing one into vagueness.

## Contact details on the site

`info@digivisions.net` · `linkedin.com/in/andynguyen88` · a 15-minute booking
link. Keep these consistent between `index.html`, `vi/index.html` and `llms.txt`.

## Reading more

The site files live on Andy's Mac and cannot be opened from this container.
There is no Claude Code project memory and no Obsidian note for this project —
this skill is the recorded context. If a question needs the actual files, ask
Andy or route it through the Claude Code offload.
