"use client";

import { useEffect, useState } from "react";
import { Server, HardDrive, RefreshCw } from "lucide-react";
import { Eyebrow, Panel, Pill, Button } from "@/components/ui/kit";

interface InfraData {
  services: { name: string; up: boolean }[];
  allUp: boolean;
  mounts: { label: string; mounted: boolean }[];
  macConnected: boolean;
  vaultSyncedAt: string | null;
  generatedAt: string;
}

function timeAgo(d: string | null) {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
  if (dy > 0) return `${dy}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

export default function InfrastructurePage() {
  const [infra, setInfra] = useState<InfraData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloading, setReloading] = useState(false);

  const load = async () => {
    setReloading(true);
    try {
      const res = await fetch("/api/infra");
      if (res.ok) setInfra(await res.json());
    } finally {
      setReloading(false);
      setLoaded(true);
    }
  };

  useEffect(() => { load(); }, []);

  const svc = infra?.services ?? [];

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="pt-4 pb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2.5">System</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--hq-text)]">Infrastructure</h1>
          <p className="num text-[var(--hq-text-ghost)] text-[12px] mt-2.5">
            VPS 72.62.79.32 · Hostinger · {infra ? `checked ${timeAgo(infra.generatedAt)}` : "checking…"}
          </p>
        </div>
        <Button onClick={load} disabled={reloading} size="sm">
          <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Services */}
        <Panel className="h-full">
          <div className="flex items-center justify-between mb-4">
            <Eyebrow>Services</Eyebrow>
            <Pill>{infra?.allUp ? "All up" : `${svc.filter(s => !s.up).length} down`}</Pill>
          </div>
          <div className="space-y-2">
            {svc.map(s => (
              <div key={s.name} className="flex items-center gap-3 rounded-lg border border-[var(--hq-hairline)] bg-white/[0.02] px-3 py-2.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.up ? "var(--up)" : "var(--down)" }} />
                <Server className="w-3.5 h-3.5 text-[var(--hq-text-ghost)]" />
                <span className="text-[13px] text-[var(--hq-text)]">{s.name}</span>
                <span className="ml-auto text-[11px] font-medium" style={{ color: s.up ? "var(--up)" : "var(--down)" }}>
                  {s.up ? "online" : "offline"}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Mac mounts */}
        <Panel className="h-full">
          <div className="flex items-center justify-between mb-4">
            <Eyebrow>Mac Connections</Eyebrow>
            <Pill>{infra?.macConnected ? "Mac online" : "Mac offline"}</Pill>
          </div>
          <div className="space-y-2">
            {(infra?.mounts ?? []).map(m => (
              <div key={m.label} className="flex items-center gap-3 rounded-lg border border-[var(--hq-hairline)] bg-white/[0.02] px-3 py-2.5">
                <HardDrive className="w-3.5 h-3.5 text-[var(--hq-text-ghost)]" />
                <span className="text-[13px] text-[var(--hq-text)]">{m.label}</span>
                <span className="ml-auto text-[11px] font-medium" style={{ color: m.mounted ? "var(--up)" : "var(--down)" }}>
                  {m.mounted ? "mounted" : "unmounted"}
                </span>
              </div>
            ))}
          </div>
          <div className="num text-[10.5px] text-[var(--hq-text-faint)] mt-3">
            Vault mirror synced {timeAgo(infra?.vaultSyncedAt ?? null)} · auto-sync every 6h + on boot
          </div>
        </Panel>
      </div>
    </div>
  );
}
