"use client";

import { MessageSquare } from "lucide-react";
import { Panel, Eyebrow, SectionHeader } from "@/components/ui/kit";

const CLIENTS = [
  { slug: "klaily", name: "Klaily" },
  { slug: "move-fitness", name: "Move Fitness" },
  { slug: "safe-english", name: "Safe English" },
];

export default function ClientsPage() {
  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="hq-rise pt-4 pb-8">
        <Eyebrow>Client workspaces</Eyebrow>
        <h1 className="mt-2.5 text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
          Clients
        </h1>
      </div>

      <SectionHeader label="Workspaces" title="Chat with Hermes per client" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CLIENTS.map((c) => (
          <Panel key={c.slug} href={`/clients/${c.slug}`} interactive className="p-5">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center mb-3"
              style={{ background: "var(--surface-2)", color: "var(--text-2)" }}
            >
              <MessageSquare className="w-4 h-4" />
            </div>
            <h3 className="text-[15px] font-medium text-[var(--text)]">{c.name}</h3>
            <p className="mt-1 text-[12.5px] text-[var(--text-3)]">Open chat workspace</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
