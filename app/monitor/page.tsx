"use client";
// Live Monitor — run list (active first) + run detail: stage stepper, per-source cards,
// funnel, real log console. Polls every 2s while the selected run is queued/running.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, JsonViewer, Skeleton, fmtIST, useAutoScroll } from "@/components/ui";
import { StatusPill } from "../page";

type RunSummary = { id: string; workflow_id: string; workflow_title?: string; status: string; stage: string; started_at: string; trigger: string };
type RunDetail = {
  run: { id: string; workflow_id: string; trigger: string; status: string; stage: string; started_at: string; finished_at: string | null; stats: any; error: string | null; previous_run_id: string | null };
  sources: { id: string; adapter: string; status: string; found: number; processed: number; accepted: number; rejected: number; error: string | null; queries_used: string[] }[];
  logs: { t: string; level: string; source: string; msg: string }[];
  ai_outputs: { id: string; stage: string; label: string; raw: unknown }[];
};

const STAGES = ["queued", "interpreting", "searching", "extracting", "validating", "done"];

function StageStepper({ stage, status }: { stage: string; status: string }) {
  const idx = STAGES.indexOf(stage);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {STAGES.map((s, i) => {
        const done = i < idx || (s === "done" && ["completed", "partial", "failed"].includes(status));
        const current = i === idx && !done && !["completed", "partial", "failed"].includes(status);
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                done ? "bg-teal-700 text-white" : current ? "bg-teal-100 text-teal-800 ring-2 ring-teal-600" : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done || current ? "font-medium text-slate-800" : "text-slate-400"}>{s === "done" ? (status === "failed" ? "Failed" : "Completed") : s}</span>
            {i < STAGES.length - 1 ? <span className="mx-1 h-px w-4 bg-slate-300" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function LogConsole({ logs }: { logs: RunDetail["logs"] }) {
  const ref = useAutoScroll(logs.length);
  return (
    <div ref={ref} className="slim-scroll max-h-96 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-200" aria-label="Run log console">
      {logs.length === 0 ? <p className="text-slate-500">Waiting for pipeline output…</p> : null}
      {logs.map((l, i) => (
        <p key={i} className={l.level === "error" ? "text-red-300" : l.level === "warn" ? "text-amber-300" : ""}>
          <span className="text-slate-500">{l.t}</span> [{l.source}] {l.msg}
        </p>
      ))}
    </div>
  );
}

function MonitorInner() {
  const sp = useSearchParams();
  const initialRun = sp.get("run");
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initialRun);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      const data = await res.json();
      setRuns(data.recent_runs ?? []);
      if (!selected && data.recent_runs?.length) setSelected(data.recent_runs[0].id);
    } catch {
      /* keep previous */
    }
  }, [selected]);

  const loadDetail = useCallback(async (runId: string) => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: RunDetail = await res.json();
      setDetail(data);
      // stop polling when terminal
      if (!["queued", "running"].includes(data.run.status) && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      /* keep previous */
    }
  }, []);

  useEffect(() => {
    loadRuns();
    const iv = setInterval(loadRuns, 4000);
    return () => clearInterval(iv);
  }, [loadRuns]);

  useEffect(() => {
    if (!selected) return;
    loadDetail(selected);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadDetail(selected), 2000); // poll every 2s while active
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [selected, loadDetail]);

  async function retry() {
    if (!detail) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/runs/${detail.run.id}/retry`, { method: "POST" });
      const data = await res.json();
      if (data.run_id) {
        setSelected(data.run_id);
      }
    } finally {
      setRetrying(false);
    }
  }

  const active = detail ? ["queued", "running"].includes(detail.run.status) : false;

  return (
    <>
      <PageHeader title="Live Monitor" subtitle="Every stage transition and log line below is written by real pipeline execution." />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Run list */}
        <Card className="self-start">
          <CardHeader title="Runs" subtitle="Active first" />
          <CardBody className="p-0">
            {!runs ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <EmptyState message="No runs yet. Execute a collection first." actionLabel="New Collection" onAction={() => (window.location.href = "/new")} />
            ) : (
              <ul className="slim-scroll max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {[...runs].sort((a, b) => (a.status === "running" || a.status === "queued" ? -1 : 1) - (b.status === "running" || b.status === "queued" ? -1 : 1)).map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className={`flex w-full flex-col gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${selected === r.id ? "bg-teal-50" : ""}`}
                    >
                      <span className="truncate font-medium text-slate-800">{r.workflow_title ?? r.id.slice(0, 8)}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">
                        {fmtIST(r.started_at)} · {r.trigger}
                      </span>
                      <StatusPill status={r.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Run detail */}
        <div className="space-y-6">
          {!detail ? (
            <Card>
              <CardBody>
                <Skeleton className="h-8" />
              </CardBody>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader
                  title={
                    <span className="flex items-center gap-3">
                      Run <span className="font-mono text-xs text-slate-500">{detail.run.id.slice(0, 8)}</span>
                      <StatusPill status={detail.run.status} />
                    </span>
                  }
                  subtitle={`Started ${fmtIST(detail.run.started_at)} · trigger: ${detail.run.trigger}`}
                  action={
                    ["partial", "failed"].includes(detail.run.status) ? (
                      <Button size="sm" variant="outline" onClick={retry} disabled={retrying}>
                        {retrying ? "Retrying…" : "Retry failed sources"}
                      </Button>
                    ) : undefined
                  }
                />
                <CardBody className="space-y-4">
                  <StageStepper stage={detail.run.stage} status={detail.run.status} />
                  {detail.run.error ? <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{detail.run.error}</p> : null}

                  {/* Per-source cards */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {detail.sources.map((s) => (
                      <div key={s.id} className="rounded-md border border-slate-200 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-800">{s.adapter}</p>
                          <Badge tone={s.status === "ok" ? "green" : s.status === "error" ? "red" : s.status === "working" ? "teal" : "slate"}>{s.status}</Badge>
                        </div>
                        <p className="mt-1 font-mono text-xs text-slate-500">
                          found {s.found} → processed {s.processed} → accepted {s.accepted} / rejected {s.rejected}
                        </p>
                        {s.error ? <p className="mt-1 text-xs text-red-600">{s.error}</p> : null}
                      </div>
                    ))}
                  </div>

                  {/* Funnel */}
                  {detail.run.stats ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold uppercase tracking-wide">Funnel:</span>
                      <Badge tone="slate">found {detail.run.stats.found ?? 0}</Badge>→
                      <Badge tone="slate">processed {detail.run.stats.processed ?? 0}</Badge>→
                      <Badge tone="green">accepted {detail.run.stats.accepted ?? 0}</Badge>
                      <Badge tone="red">rejected {detail.run.stats.rejected ?? 0}</Badge>
                      <Badge tone="amber">duplicates merged {detail.run.stats.duplicates_merged ?? 0}</Badge>
                    </div>
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Log console" subtitle="Timestamped (IST) · newest at bottom · auto-scroll" />
                <CardBody>
                  <LogConsole logs={detail.logs} />
                </CardBody>
              </Card>

              {/* Raw AI outputs audit trail */}
              {detail.ai_outputs.length ? (
                <Card>
                  <CardHeader title="Raw AI outputs" subtitle="Actual model/fallback responses for this run — audit trail" />
                  <CardBody className="space-y-2">
                    {detail.ai_outputs.map((o) => (
                      <JsonViewer key={o.id} label={o.label} raw={o.raw} />
                    ))}
                  </CardBody>
                </Card>
              ) : null}
            </>
          )}
          {active ? <p className="text-xs text-slate-400">Polling every 2s while the run is active…</p> : null}
        </div>
      </div>
    </>
  );
}

export default function MonitorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <MonitorInner />
    </Suspense>
  );
}
