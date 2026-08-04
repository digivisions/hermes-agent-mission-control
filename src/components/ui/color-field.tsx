"use client";

/* Swatch-grid colour picker — replaces the raw hex TextInput. Emits
   "#rrggbb" or "" (nullable accent). Swatch values are literal hexes by
   design; only the chrome around them uses tokens. */

const SWATCHES = [
  "#3a506b", "#34d399", "#a78bfa", "#60a5fa",
  "#f472b6", "#fbbf24", "#818cf8", "#ef4444",
  "#10b981", "#f59e0b", "#6ee7b7", "#94a3b8",
];

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {SWATCHES.map((hex) => {
          const selected = value.toLowerCase() === hex;
          return (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              aria-label={hex}
              aria-pressed={selected}
              className="w-7 h-7 rounded-full shrink-0 transition-transform"
              style={{
                background: hex,
                outline: selected ? "2px solid var(--text)" : "1px solid var(--line)",
                outlineOffset: 2,
                transform: selected ? "scale(1.08)" : undefined,
              }}
            />
          );
        })}
        <label
          className="w-7 h-7 rounded-full shrink-0 cursor-pointer overflow-hidden relative"
          style={{ border: "1px solid var(--line)", background: value || "var(--surface-1)" }}
          title="Custom colour"
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#94a3b8"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors self-center ml-1"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
