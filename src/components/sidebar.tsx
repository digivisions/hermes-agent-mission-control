"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home, Bot, Lightbulb, BookOpen, Briefcase, HeartPulse, Server,
  Menu, X, LayoutGrid, FolderKanban,
} from "lucide-react";

const navGroups = [
  {
    name: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: Home },
      { href: "/tasks", label: "Tasks", icon: LayoutGrid },
      { href: "/hermes", label: "Hermes", icon: Bot },
    ],
  },
  {
    name: "Work",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/clients", label: "Clients", icon: Briefcase },
    ],
  },
  {
    name: "System",
    items: [
      { href: "/infrastructure", label: "Infrastructure", icon: Server },
      { href: "/memory-wiki", label: "Memory Wiki", icon: BookOpen },
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
    ],
  },
];

// Mobile tab bar - only show the 5 most important
const mobileTabsRaw = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/tasks", label: "Tasks", icon: LayoutGrid },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/hermes", label: "Hermes", icon: Bot },
  { href: "/memory-wiki", label: "Wiki", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsOpen(false));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  // Close sidebar when resizing to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 h-14 border-b border-[var(--hq-hairline)] bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] backdrop-blur">
        <button onClick={() => setIsOpen(true)} className="p-1.5 -ml-1.5" aria-label="Open menu">
          <Menu className="w-5 h-5 text-[var(--hq-text)]" />
        </button>
        <Link href="/" className="flex items-center">
          <img src="/digivisions-horizontal.png" alt="Digivisions" className="h-5 w-auto object-contain" style={{ maxWidth: "8rem" }} />
        </Link>
        <div className="w-8" />
      </div>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-[rgba(23,32,42,0.5)]" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-[var(--bg)] border-r border-[var(--hq-hairline)] p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <img src="/digivisions-horizontal.png" alt="Digivisions" className="h-5 w-auto object-contain" style={{ maxWidth: "8rem" }} />
              <button onClick={() => setIsOpen(false)} className="p-1.5 -mr-1.5" aria-label="Close menu">
                <X className="w-5 h-5 text-[var(--hq-text)]" />
              </button>
            </div>
            <SidebarNav groups={navGroups} isActive={isActive} onNavigate={() => setIsOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar — relative so it participates in the flex row (content flows beside it) */}
      <aside className="hidden md:flex relative shrink-0 w-[15rem] flex-col border-r border-[var(--hq-hairline)] bg-[color-mix(in_srgb,var(--bg)_98%,transparent)] p-4 overflow-y-auto">
        <Link href="/" className="flex items-center px-2 py-3 mb-2">
          <img
            src="/digivisions-horizontal.png"
            alt="Digivisions"
            className="h-6 w-auto object-contain"
            style={{ maxWidth: "9.5rem" }}
          />
        </Link>
        <SidebarNav groups={navGroups} isActive={isActive} />
      </aside>
    </>
  );
}

function SidebarNav({ groups, isActive, onNavigate }: {
  groups: typeof navGroups;
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.name}>
          <div className="eyebrow !text-[9.5px] !text-[var(--hq-text-faint)] px-2 mb-1.5">{group.name}</div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                    active
                      ? "bg-[rgba(58,80,107,0.10)] text-[var(--hq-text)] font-medium"
                      : "text-[var(--hq-text-2)] hover:bg-[rgba(58,80,107,0.06)] hover:text-[var(--hq-text)]"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-[var(--hq-accent)]" : "text-[var(--hq-text-ghost)]"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
