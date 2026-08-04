"use client";

import { useRef } from "react";
import { Pill } from "@/components/ui/kit";

/** Accessible single-select radio group rendered as Pills — replaces a
 *  <select> for short enum lists. Arrow keys move focus and selection. */
export function PillPicker({
  options, value, onChange, labelFor,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  labelFor?: (v: string) => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = options.indexOf(value);
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = options[(idx + 1 + options.length) % options.length];
      onChange(next);
      focusOption(next);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = options[(idx - 1 + options.length) % options.length];
      onChange(prev);
      focusOption(prev);
    }
  };

  const focusOption = (v: string) => {
    rootRef.current?.querySelector<HTMLButtonElement>(`[data-value="${v}"]`)?.focus();
  };

  return (
    <div role="radiogroup" ref={rootRef} className="flex flex-wrap gap-1.5" onKeyDown={onKeyDown}>
      {options.map((o) => {
        const selected = o === value;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={o}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o)}
            className="transition-transform focus-visible:outline-none"
            style={{ transform: selected ? "scale(1.03)" : undefined }}
          >
            <Pill tone={selected ? "accent" : "neutral"}>{labelFor ? labelFor(o) : o}</Pill>
          </button>
        );
      })}
    </div>
  );
}
