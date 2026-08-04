import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The registry. Slug is the contract: it is the URL segment, the
// ChatMessage.client value, and the AgentRequest.profile value.
const CLIENTS = [
  { slug: "klaily",                name: "Klaily",               type: "ecommerce", hermesProfile: "klaily",       status: "active",       accent: "#34d399", description: "Botanical earrings store + custom OS 2.0 theme; family business with sister on Palmstreet.", repoPath: "/Users/annguyen/Claude/Projects/Klaily" },
  { slug: "move-fitness",          name: "MoveVN",               type: "webapp",    hermesProfile: "move-fitness", status: "unconfigured", accent: "#f472b6", description: "MOVE platform — content, blog, site maintenance." },
  { slug: "safe-english",          name: "Anh Ngu An Toan",      type: "edtech",    hermesProfile: "safe-english", status: "unconfigured", accent: "#f87171", description: "Safety English learning platform.", repoPath: "/Users/annguyen/PhpstormProjects/anhnguantoan" },
  { slug: "soongs",                name: "SOONGS",               type: "ecommerce", hermesProfile: null,           status: "unconfigured", accent: "#fbbf24", description: "Local brand — custom Shopify theme and coding." },
  { slug: "chubb-dev",             name: "CHUBB Dev",            type: "internal",  hermesProfile: "chubb-apac",   status: "unconfigured", accent: "#60a5fa", description: "Day-to-day engineering work at CHUBB." },
  { slug: "immersive-travel-asia", name: "Immersive Travel Asia",type: "agency",    hermesProfile: null,           status: "unconfigured", accent: "#a78bfa", description: "Travel itinerary content and publishing." },
];

async function main() {
  for (const c of CLIENTS) {
    // update-on-conflict but NEVER clobber status/hermesProfile — the
    // provisioning script owns those once a profile is live.
    await prisma.client.upsert({
      where:  { slug: c.slug },
      update: { name: c.name, type: c.type, accent: c.accent, description: c.description, repoPath: c.repoPath ?? null },
      create: { ...c, model: "deepseek-v4-flash" },
    });
    console.log(`✓ ${c.slug}`);
  }
  console.log(`\n${CLIENTS.length} clients in registry.`);
}

main().finally(() => prisma.$disconnect());
