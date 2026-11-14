"use client";
// App shell: left sidebar (collapses to drawer on mobile), topbar with live-runs dot,
// sticky footer. Sidebar order = demo order (spec section 12).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FilePlus2, Radio, Table2, History, CalendarClock, Upload, Menu, X, Crosshair,
} from "lucide-react";
import { cn, Button } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/new", label: "New Collection", icon: FilePlus2 },
  { href: "/monitor", label: "Live Monitor", icon: Radio },
  { href: "/results", label: "Results", icon: Table2 },
  { href: "/history", label: "History", icon: History },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { href: "/import", label: "Import Dataset", icon: Upload },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [activeRuns, setActiveRuns] = useState(0);

  useEffect(() => setOpen(false), [pathname]);

  // live-runs indicator: poll every 5s
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        const data = await res.json();
        if (alive) setActiveRuns(data.active_runs ?? 0);
      } catch {
        /* offline — indicator stays as-is */
      }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-2 px-2 py-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-700 text-white">
          <Crosshair className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-bold tracking-wide text-slate-900">SCOUT</p>
          <p className="text-[11px] leading-tight text-slate-500">India Opportunity Intelligence</p>
        </div>
      </div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm font-medium",
              active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
            {href === "/monitor" && activeRuns > 0 ? (
              <span className="ml-auto pulse-dot h-2 w-2 rounded-full bg-red-500" aria-label={`${activeRuns} active runs`} />
            ) : null}
          </Link>
        );
      })}
      <div className="mt-auto px-2 text-[11px] leading-relaxed text-slate-400">
        Built for Infra Shift Hackathon 2026 · PS1
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* Mobile topbar */}
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-white">
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-sm font-bold">SCOUT</span>
        </div>
        <div className="flex items-center gap-3">
          {activeRuns > 0 ? <span className="pulse-dot h-2 w-2 rounded-full bg-red-500" aria-label={`${activeRuns} active runs`} /> : null}
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </Button>
        </div>
      </header>
      {open ? <div className="border-b border-slate-200 bg-white lg:hidden">{sidebar}</div> : null}

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
          <footer className="mt-auto border-t border-slate-200 px-4 py-3 text-xs text-slate-400 sm:px-6">
            SCOUT · Built for Infra Shift Hackathon 2026 · PS1
          </footer>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, note }: { title: string; subtitle?: string; note?: string }) {
  return (
    <section className="mb-6">
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      {note ? <p className="mt-2 text-xs text-amber-700">{note}</p> : null}
    </section>
  );
}
