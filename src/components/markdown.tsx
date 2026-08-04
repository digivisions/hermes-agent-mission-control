"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-2.5 last:mb-0 pl-4 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 last:mb-0 pl-4 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent)" }}>
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code
      className="rounded px-1 py-0.5 text-[12px] num"
      style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre
      className="mb-2.5 last:mb-0 rounded-[8px] p-2.5 text-[12px] overflow-x-auto"
      style={{ background: "var(--surface-1)", border: "1px solid var(--line)" }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="mb-2.5 last:mb-0 pl-3 italic text-[var(--text-2)]"
      style={{ borderLeft: "2px solid var(--line)" }}
    >
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="mb-2.5 last:mb-0 overflow-x-auto">
      <table className="text-[12.5px] border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left font-semibold" style={{ borderBottom: "1px solid var(--line)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1" style={{ borderBottom: "1px solid var(--line)" }}>
      {children}
    </td>
  ),
  h1: ({ children }) => <h1 className="text-[13px] font-semibold text-[var(--text)] mt-3 first:mt-0 mb-1.5">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[13px] font-semibold text-[var(--text)] mt-3 first:mt-0 mb-1.5">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[13px] font-semibold text-[var(--text)] mt-3 first:mt-0 mb-1.5">{children}</h3>,
  hr: () => <hr style={{ borderColor: "var(--line)" }} className="my-3" />,
};

export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`text-[12.5px] text-[var(--text-2)] ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  );
}

/** Markdown → one-line plain text, for card previews (D11). */
export function plainPreview(md: string, max = 180) {
  const s = md
    .replace(/```[\s\S]*?```/g, " ")        // fenced code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")  // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")// links → label
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}
