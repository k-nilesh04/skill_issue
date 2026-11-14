"use client";
// Overview — stat cards, recent activity, recent changes, business model card.

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Skeleton, fmtIST } from "@/components/ui";
import { LayoutDashboard, FilePlus2, Radio, CalendarClock, Sparkles } from "lucide-react";

type Stats = {
  workflows: number;
  records: number;
  sample_records: number;
  active_runs: number;
  active_schedules: number;
  records_last_24h: number;
  total_runs: number;
  recent_runs: {
    id: string;
    workflow_id: string;
    workflow_title: string;
    language: string;
    trigger: string;
    status: string;
    started_at: string;
    stats: { accepted?: number; diff?: { new: number; changed: number; missing: number; unchanged: number } } | null;
  }[];
  recent_change: { new: number; changed: number; missing: number; unchanged: number } | null;
};

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: "green" | "amber" | "red" | "slate" | "teal"; label: string }> = {
    completed: { tone: "green", label: "Completed" },
    partial: { tone: "amber", label: "Partial" },
    failed: { tone: "red", label: "Failed" },
    running: { tone: "teal", label: "Running" },
    queued: { tone: "slate", label: "Queued" },
  };
  const v = map[status] ?? { tone: "slate" as const, label: status };
  return (
    <Badge tone={v.tone}>
      {status === "running" ? <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-teal-600" /> : null}
      {v.label}
    </Badge>
  );
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        const data = await res.json();
        if (alive) {
          setStats(data);
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    load();
    const iv = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  const cards = stats
    ? [
        { icon: LayoutDashboard, label: "Workflows", value: stats.workflows, href: "/history" },
        { icon: FilePlus2, label: "Live records", value: stats.records, href: "/results" },
        { icon: Radio, label: "Active runs", value: stats.active_runs, href: "/monitor" },
        { icon: CalendarClock, label: "Active schedules", value: stats.active_schedules, href: "/schedules" },
        { icon: Sparkles, label: "Records added (24h)", value: stats.records_last_24h, href: "/results" },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Prompt-based data intelligence for Indian tech-event discovery and monitoring."
        note={
          stats && stats.sample_records > 0
            ? "Sample data is present and badged SAMPLE — it never mixes with live run results."
            : undefined
        }
      />

      {/* Stat cards */}
      <section aria-label="Key statistics" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {!stats
          ? cards.map((_, i) => (
              <Card key={i}>
                <CardBody className="space-y-2">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-3 w-20" />
                </CardBody>
              </Card>
            ))
          : cards.map(({ icon: Icon, label, value, href }) => (
              <Link key={label} href={href}>
                <Card className="transition-colors hover:border-teal-300">
                  <CardBody>
                    <Icon className="mb-2 h-4 w-4 text-teal-700" aria-hidden />
                    <p className="font-mono text-2xl font-semibold text-slate-900">{value}</p>
                    <p className="text-xs text-slate-500">{label}</p>
                  </CardBody>
                </Card>
              </Link>
            ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Recent activity */}
        <Card>
          <CardHeader title="Recent activity" subtitle="Last 8 runs" action={<Link href="/monitor" className="text-xs font-medium text-teal-700 hover:underline">View all</Link>} />
          <CardBody className="p-0">
            {!stats ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            ) : stats.recent_runs.length === 0 ? (
              <EmptyState message="No runs yet — create your first collection." actionLabel="New Collection" onAction={() => (window.location.href = "/new")} />
            ) : (
              <ul className="slim-scroll max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {stats.recent_runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <div className="min-w-0">
                      <Link href={`/monitor?run=${r.id}`} className="block truncate font-medium text-slate-800 hover:text-teal-700">
                        {r.workflow_title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {fmtIST(r.started_at)} · {r.trigger}
                        {r.stats?.diff ? ` · +${r.stats.diff.new} new` : ""}
                      </p>
                    </div>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          {/* Recent changes */}
          <Card>
            <CardHeader title="Recent changes" subtitle="Latest run-over-run diff summary" action={<Link href="/history" className="text-xs font-medium text-teal-700 hover:underline">History</Link>} />
            <CardBody>
              {!stats ? (
                <Skeleton className="h-10" />
              ) : stats.recent_change ? (
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge tone="green">+{stats.recent_change.new} new</Badge>
                  <Badge tone="amber">~{stats.recent_change.changed} changed</Badge>
                  <Badge tone="red">-{stats.recent_change.missing} missing</Badge>
                  <Badge tone="slate">={stats.recent_change.unchanged} unchanged</Badge>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No diff yet — create a schedule and run it twice to see change detection.</p>
              )}
            </CardBody>
          </Card>

          {/* Business model card */}
          <Card>
            <CardHeader title="Business model — hypothesis" subtitle="Pricing hypothesis only; no traction claims" />
            <CardBody className="text-sm text-slate-600">
              <p className="mb-3 font-medium text-slate-800">&ldquo;SCOUT for Teams&rdquo;</p>
              <ul className="slim-scroll max-h-96 space-y-1.5 overflow-y-auto">
                <li className="flex justify-between gap-4"><span>Starter</span><span className="font-mono text-right text-slate-800">₹999/mo · 1 workflow, weekly schedule, CSV export</span></li>
                <li className="flex justify-between gap-4"><span>Community</span><span className="font-mono text-right text-slate-800">₹2,499/mo · 5 workflows, daily schedules, diff alerts, CSV import</span></li>
                <li className="flex justify-between gap-4"><span>Event Team</span><span className="font-mono text-right text-slate-800">₹7,999/mo · unlimited, multi-source, priority support</span></li>
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                Customers pay for scheduled monitoring with change detection — continuously fresh, verified, deduplicated data
                replacing manual tracking across 10+ scattered sites and groups. Go-to-market: free 30-day pilots with
                Delhi-NCR college tech societies at a ₹499 founding-customer rate.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {err ? (
        <p className="mt-4 text-sm text-red-600">
          Failed to load stats.{" "}
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </p>
      ) : null}
    </>
  );
}
