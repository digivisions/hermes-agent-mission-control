"use client";

import { useEffect, useState } from "react";
import { Briefcase, Wallet, Pencil } from "lucide-react";
import { Eyebrow, Panel, Pill, Button } from "@/components/ui/kit";

interface KlailyData {
  month: string; revenue: number | null; orders: number | null; note: string;
  source: string; palmstreetYearly: string | null; vaultUpdated: string | null;
}

const clients = [
  { name: "Klaily", type: "E-commerce · Shopify", desc: "Botanical earrings store + custom OS 2.0 theme, family business with sister on Palmstreet.", accent: "#34d399" },
  { name: "SOONGS", type: "Shopify · Custom Theme", desc: "Local brand — custom theme and Shopify coding (15M VND engagement).", accent: "#fbbf24" },
  { name: "CHUBB Dev", type: "Day job · Insurance", desc: "Day-to-day engineering work at CHUBB.", accent: "#60a5fa" },
  { name: "MoveVN", type: "Platform · Training", desc: "MOVE platform — content, blog, site maintenance.", accent: "#f472b6" },
  { name: "Immersive Travel Asia", type: "Travel · Content", desc: "Travel itinerary content and publishing.", accent: "#a78bfa" },
  { name: "Anh Ngu An Toan", type: "EdTech · English", desc: "Safety English learning platform.", accent: "#f87171" },
];

export default function ClientsPage() {
  const [klaily, setKlaily] = useState<KlailyData | null>(null);
  const [revInput, setRevInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/klaily/revenue").then(r => r.ok ? r.json() : null).then(d => { if (d) setKlaily(d); }).catch(() => {});
  }, []);

  const saveRevenue = async () => {
    const v = Number(revInput);
    if (!v || Number.isNaN(v)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/klaily/revenue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenue: v }),
      });
      if (res.ok) {
        const d = await res.json();
        setKlaily(d.data);
        setRevInput("");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative z-10 w-full mx-auto pb-16">
      <div className="pt-4 pb-8">
        <div className="eyebrow mb-2.5">Digital Visions</div>
        <h1 className="text-[32px] font-semibold tracking-[-0.02em] leading-none text-[var(--hq-text)]">Clients</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {clients.map((c, i) => (
          <Panel key={c.name} className="h-full flex flex-col p-6">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-[var(--r-md)] flex items-center justify-center" style={{ background: "color-mix(in srgb, " + c.accent + " 15%, transparent)", color: c.accent }}>
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[var(--hq-text)]">{c.name}</h3>
                <div className="eyebrow !text-[9px] !text-[var(--hq-text-faint)]">{c.type}</div>
              </div>
            </div>
            <p className="text-[12.5px] text-[var(--hq-text-2)] leading-relaxed">{c.desc}</p>
            {c.name === "Klaily" && (
              <div className="mt-4 pt-3 border-t border-[var(--hq-hairline)]">
                <div className="flex items-center justify-between mb-2">
                  <Eyebrow className="!text-[9.5px]">This month · {klaily?.month || "—"}</Eyebrow>
                  <Wallet className="w-3.5 h-3.5 text-[var(--hq-text-ghost)]" />
                </div>
                <div className="flex items-end gap-2">
                  <span className="num font-semibold text-[26px] leading-none text-[var(--hq-text)]">
                    {klaily?.revenue === null || klaily?.revenue === undefined ? "—" : `$${klaily.revenue.toLocaleString("en-US")}`}
                  </span>
                  {klaily?.orders !== null && klaily?.orders !== undefined && (
                    <span className="num text-[11.5px] text-[var(--hq-text-ghost)] mb-0.5">{klaily.orders} orders</span>
                  )}
                </div>
                {klaily?.palmstreetYearly && (
                  <div className="num text-[10.5px] text-[var(--hq-text-faint)] mt-1.5">Palmstreet ~${klaily.palmstreetYearly}/yr (vault)</div>
                )}
                <div className="flex gap-2 mt-3">
                  <input
                    value={revInput}
                    onChange={e => setRevInput(e.target.value)}
                    placeholder="Monthly revenue $"
                    className="flex-1 min-w-0 rounded-lg border border-[var(--hq-hairline)] bg-[rgba(58,80,107,0.045)] px-3 py-1.5 text-[12.5px] text-[var(--hq-text)] outline-none focus:border-[var(--hq-accent)]"
                  />
                  <Button onClick={saveRevenue} disabled={saving} size="sm">
                    <Pencil className="w-3.5 h-3.5" /> {saving ? "Saving" : "Save"}
                  </Button>
                </div>
                <div className="num text-[10px] text-[var(--hq-text-faint)] mt-2">Stored in dashboard DB — not written to the vault.</div>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
