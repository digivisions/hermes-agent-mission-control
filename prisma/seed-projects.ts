import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Digital Visions' OWN projects. Client work lives in prisma/seed-clients.ts
// and is a SEPARATE registry (Spec C, D3) — never add a client here.
// Content transcribed 2026-08-04 from the Obsidian vault Projects/ notes,
// which /api/projects read directly through commit 74e24a3.
const PROJECTS = [
  {
    slug: "digivisions-hq", name: "DigivisionsHQ", type: "internal",
    status: "active", priority: "high", accent: "#3a506b",
    tags: ["mission-control", "hermes", "nextjs"],
    location: "/Users/annguyen/1-Development/hermes-agent-mission-control",
    description: "This dashboard — mission control at myhq.digivisions.net.",
    overview:
      "Self-hosted mission-control dashboard for Andy's Hermes agents and Digital Visions operations. Next.js app on the Hostinger VPS: daily chief-of-staff brief, client workspaces, task/kanban mirror, infrastructure health, Obsidian-backed memory wiki. Architecture: dashboard (web) ↔ Postgres message bus ↔ bridge ↔ Hermes CLI. Formerly Hermy HQ; rebranded 2026-08-03.",
    nextActions: [
      "Wire a Shopify Admin API token so Klaily revenue on the Clients page is automatic (currently manual entry).",
      "Verify all 7 infra services stay green after the honcho/n8n naming fix.",
      "Consider a 'reset layout' button for the draggable dashboard grid.",
    ],
    waitingOn: ["Andy's Shopify Admin API token (for automatic Klaily revenue)."],
  },
  {
    slug: "echo", name: "Micro-Recorder (Echo)", type: "product",
    status: "active", priority: "high", accent: "#34d399",
    tags: ["hardware", "esp32", "react-native"],
    location: "/Users/annguyen/1-Development/Micro_Recorder",
    description: "Pocket hardware voice recorder + transcription app.",
    overview:
      "ESP32-C6 board with a 1.54\" e-ink screen, two-button UI, ES8311 codec, microSD and BLE/Wi-Fi. Recordings sync to the cloud directly or relayed via the phone (proximity sync), where Groq Whisper transcribes and Gemini/Groq structures them into titled, tagged notes surfaced in a React Native app with a RAG 'Ask Echo' chat. Cleanroom build against Project Echo Plan/. Monorepo: github.com/digivisions/echo (private).",
    nextActions: [
      "Re-read CLAUDE.md, git state and echo-firmware/.planning/STATE.md before resuming.",
      "Continue the ESP32-S3 port per the current roadmap and phase plan.",
      "Preserve the integration contracts in Project Echo Plan/07-Integration-Master-Plan.md for cross-component changes.",
    ],
    waitingOn: ["PPK2 power measurements, Apple signing, second-device verification."],
  },
  {
    slug: "immersive-travel-asia", name: "Immersive Travel Asia", type: "client-site",
    status: "active", priority: "high", accent: "#a78bfa",
    tags: ["wordpress", "travel", "acf"],
    location: "/Volumes/DATA2/1-Development/Immersive",
    description: "Pan-SEA luxury travel brand site — WordPress on Hostinger staging.",
    overview:
      "Began as a Claude Design project, direction '1a Heritage' (jade/gold/cream, Playfair Display + Source Sans 3). Shipped first as a static Netlify approval demo, then rebuilt as a full WordPress site (custom classic theme + ACF Pro) live on Hostinger staging. Static demo: immersive-travel-asia-demo.netlify.app. Staging: staging-ita.digivisions.net. Planned launch domain: immersivetravelasia.digivisions.net (DNS on Cloudflare).",
    nextActions: [
      "Reverify staging state and current theme/plugin versions before changes.",
      "QA the Vietnam itinerary pages against client source content; confirm demo-content cleanup before any irreversible deletion.",
      "Resolve ACF Pro license, WebP delivery, responsive-image coverage, About nav labels, SMTP decision.",
      "Plan launch-domain migration only after staging acceptance.",
    ],
    waitingOn: ["ACF Pro license entry by Andy.", "Final client acceptance and launch timing."],
  },
  {
    slug: "jarvis", name: "JARVIS", type: "product",
    status: "active", priority: "medium", accent: "#60a5fa",
    tags: ["voice-ai", "electron", "macos"],
    location: "/Users/annguyen/Documents/1-Development/JARVIS",
    description: "Personal AI voice companion — desktop-first, warm not robotic.",
    overview:
      "J.A.R.V.I.S.-style voice companion, desktop-first on macOS: local STT, streaming LLM, local TTS, and an animated Electron face that reacts in real time. Goals: sub-1.5s response from end of speech, consistent personality, cross-session memory, a face that feels alive rather than a loading spinner. The bet — earn its place on the desk first, then port to a physical robot (Bambulab A1 enclosure + ESP32-S3).",
    nextActions: [
      "Inspect the eight tracked changes before editing or staging.",
      "Configure BytePlus settings through the approved secret file; never copy values into Obsidian.",
      "Run the documented test suite and launch script to reverify the voice loop and Electron face.",
      "If Phase 1-2 are healthy, begin Phase 3: SQLite structured memory + LanceDB semantic retrieval.",
    ],
    waitingOn: ["Valid local API configuration for an end-to-end run."],
  },
  {
    slug: "andypi", name: "RaspberryPi (AndyPi)", type: "infra",
    status: "active", priority: "high", accent: "#f472b6",
    tags: ["homelab", "docker", "tailscale"],
    location: "/Users/annguyen/Documents/1-Development/RaspberryPi",
    description: "Homelab on a Pi 4 — private services behind Tailscale.",
    overview:
      "Raspberry Pi 4 Model B ('andypi-os') booting Raspberry Pi OS (Debian 13 trixie) from a 128 GB USB SSD. Runs a Docker Compose stack of private services (Portainer, Uptime Kuma, Healthchecks, ntfy, Vaultwarden, Gitea, n8n, Homepage, Bambuddy, Home Assistant) reachable only over Tailscale, and doubles as a Tailscale exit node with a NordVPN Stealth Mode toggle. Also hosts the Echo backend as a separate Compose project.",
    nextActions: [
      "Disable Vaultwarden public signup after confirming the intended account state.",
      "Implement and verify the restic backup phase with off-device storage and alerting.",
      "Reconcile remaining public-ingress needs for n8n/ntfy separately from the Echo Cloudflare Tunnel.",
    ],
    waitingOn: ["Andy's decision on backup target and public ingress scope."],
  },
  {
    slug: "vps-dev-center", name: "VPS Dev Center", type: "infra",
    status: "active", priority: "high", accent: "#fbbf24",
    tags: ["vps", "hostinger", "caddy"],
    location: "/Users/annguyen/Documents/1-Development/VPS_DEV_CENTER",
    description: "Browser-based remote dev environment on the Hostinger KVM2 VPS.",
    overview:
      "Self-hosted remote development environment on a Hostinger KVM2 VPS (Ubuntu 24.04.4 LTS, 8GB RAM, 2 vCPU, 100GB NVMe). Runs code-server, Agent Zero, OpenCode and Claude Code in tmux behind Caddy, with Netdata monitoring and scheduled backups. Rule of thumb: OpenCode for everyday coding, Agent Zero for DevOps, Claude Code for complex work, local Mac for Mac/iOS builds.",
    nextActions: [
      "Perform a read-only SSH health audit before the next infrastructure change.",
      "Rotate credentials exposed in local project instructions; replace plaintext with secret-location references.",
      "Verify nightly backups, security monitoring, Docker/PM2 services, firewall state and disk usage.",
    ],
    waitingOn: ["Separate approval for credential rotation and doc remediation."],
  },
  {
    slug: "realxr", name: "RealXR", type: "product",
    status: "planned", priority: "medium", accent: "#818cf8",
    tags: ["xr"],
    location: null,
    description: "RealXR — scope not yet captured in the vault.",
    overview: null,
    nextActions: ["Capture scope, stack and canonical location here."],
    waitingOn: [],
  },
  {
    slug: "andynguyen-work", name: "andynguyen.work", type: "personal",
    status: "planned", priority: "medium", accent: "#2dd4bf",
    tags: ["portfolio", "website"],
    location: null,
    description: "Personal portfolio site.",
    overview: null,
    nextActions: ["Decide stack and hosting.", "Draft the case-study list."],
    waitingOn: [],
  },
  {
    slug: "tammy-nang", name: "Tammy & Nang", type: "personal",
    status: "paused", priority: "low", accent: "#fda4af",
    tags: ["react", "netlify", "wedding"],
    location: "/Users/annguyen/Documents/1-Development/Tammy&Nang/tamnang-wedding-rsvp",
    description: "Bilingual EN/VI wedding site + RSVP. Paused.",
    overview:
      "Single-page React + TypeScript + Vite + Tailwind site deployed as static assets plus one Netlify serverless function. RSVP submissions validated and emailed through Resend; no database.",
    nextActions: [
      "Confirm whether this should resume and verify its Netlify deployment state.",
      "Replace placeholder photos, preserving the filenames referenced by wedding.ts.",
      "Add the real guest-coordinator phone number in the central config.",
    ],
    waitingOn: ["Final wedding photos.", "Guest coordinator phone number."],
  },
  {
    slug: "leanagent", name: "leanagent", type: "product",
    status: "paused", priority: "low", accent: "#94a3b8",
    tags: ["ai-agents", "local-ai", "sqlite"],
    location: "/Users/annguyen/Documents/1-Development/leanagent",
    description: "Cost-efficient local-first AI assistant. Paused pending a keep/kill call.",
    overview:
      "Routes most requests to free local models via request classification, caching, context management, budget controls, and cloud fallback for complex work. SQLite persistence; specialised agents coordinated by a central orchestrator. 31 tracked changes and two unfinished worktrees.",
    nextActions: [
      "Decide whether LeanAgent still has a distinct purpose alongside Hermes and JARVIS.",
      "Inspect the 31 tracked changes without resetting or broad staging.",
      "Review both worktrees and decide merge / archive / discard for each.",
    ],
    waitingOn: ["Andy's decision whether to resume, consolidate or archive."],
  },
];

async function main() {
  for (const [i, p] of PROJECTS.entries()) {
    // Same discipline as seed-clients.ts: update refreshes the descriptive
    // fields but NEVER clobbers status / priority / sortOrder / contextNotes.
    // Those become Andy's the moment he touches the UI.
    const { slug, ...rest } = p;
    await prisma.project.upsert({
      where: { slug },
      update: {
        name: rest.name, type: rest.type, tags: rest.tags, overview: rest.overview,
        nextActions: rest.nextActions, waitingOn: rest.waitingOn,
        location: rest.location, accent: rest.accent, description: rest.description,
      },
      create: { slug, ...rest, sortOrder: i },
    });
    console.log(`✓ ${slug}`);
  }
  console.log(`\n${PROJECTS.length} projects in registry.`);
}

main().finally(() => prisma.$disconnect());
