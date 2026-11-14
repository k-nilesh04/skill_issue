"use client";
// History — workflow cards, run timeline, run-to-run diff view with NEW / CHANGED /
// MISSING / UNCHANGED tabs and a one-sentence model summary in the query's language.

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Select, Skeleton, Tabs, fmtIST } from "@/components/ui";
import { StatusPill } from "../page";
import { allFields } from "@/lib/field-list";

type WorkflowSummary = { id: string; title: string; original_query: string; language: string; run_count: number; record_count: number; last_run_at: string | null };
type RunRow = { id: string; trigger: string; status: string; started_at: string; finished_at: string | null; stats: any; error: string | null };
type DiffData = {
  runA: { id: string; started_at: string };
  runB: { id: string; started_at: string };
  runs: { id: string; started_at: string; trigger: string; status: string }[];
  buckets: {
    new: { identity_key: string; name: string }[];
    changed: { identity_key: string; name: string; fieldDeltas?: { field: string; before: string; after: string }[] }[];
    missing: { identity_key: string; name: string }[];
    unchanged: { identity_key: string; name: string }[];
  };
};

export default function HistoryPage() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ workflow: any; runs: RunRow[] } | null>(null);
  const [runA, setRunA] = useState("");
  const [runB, setRunB] = useState("");
  const [diff, setDiff] = useState<DiffData | null>(null);
  const [tab, setTab] = useState("new");
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/workflows", { cache: "no-store" });
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
      if (data.workflows?.length) setSelected(data.workflows[0].id);
    })();
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/workflows/${id}`, { cache: "no-store" });
    const data = await res.json();
    setDetail(data);
  }, []);

  const loadDiff = useCallback(async (wfId: string, a?: string, b?: string) => {
    const params = new URLSearchParams();
    if (a && b) {
      params.set("runA", a);
      params.set("runB", b);
    }
    const res = await fetch(`/api/workflows/${wfId}/diff?${params}`, { cache: "no-store" });
    if (!res.ok) {
      setDiff(null);
      return;
    }
    const data: DiffData = await res.json();
    setDiff(data);
    // one-sentence summary in the query's original language
    const counts = { newCount: data.buckets.new.length, changedCount: data.buckets.changed.length, missingCount: data.buckets.missing.length, unchangedCount: data.buckets.unchanged.length };
    const hi = detail?.workflow?.language === "hi";
    const parts: string[] = [];
    if (hi) {
      parts.push(`${counts.newCount} नए इवेंट मिले`);
      if (counts.changedCount) parts.push(`${counts.changedCount} इवेंट में बदलाव हुआ`);
      if (counts.missingCount) parts.push(`${counts.missingCount} इवेंट अब नहीं दिख रहे`);
      if (!counts.newCount && !counts.changedCount && !counts.missingCount) parts.push("पिछली रन के बाद कोई बदलाव नहीं");
      setSummary(parts.join(", ") + "।");
    } else {
      parts.push(`${counts.newCount} new record${counts.newCount === 1 ? "" : "s"} found`);
      if (counts.changedCount) parts.push(`${counts.changedCount} changed`);
      if (counts.missingCount) parts.push(`${counts.missingCount} no longer present`);
      if (!counts.newCount && !counts.changedCount && !counts.missingCount) parts.push("no changes since the previous run");
      setSummary(parts.join(", ") + ".");
    }
  }, [detail?.workflow?.language]);

  useEffect(() => {
    if (selected) {
      loadDetail(selected);
      loadDiff(selected);
    }
  }, [selected, loadDetail, loadDiff]);

  if (!workflows) {
    return (
      <>
        <PageHeader title="History" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </>
    );
  }

  if (workflows.length === 0) {
    return (
      <>
        <PageHeader title="History" />
        <EmptyState message="No workflows yet. Create your first collection to see history." actionLabel="New Collection" onAction={() => (window.location.href = "/new")} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="History" subtitle="Saved workflows, run timelines and run-to-run comparisons." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workflows.map((w) => (
          <button key={w.id} onClick={() => setSelected(w.id)} className={`text-left ${selected === w.id ? "ring-2 ring-teal-600 rounded-lg" : ""}`}>
            <Card className="h-full transition-colors hover:border-teal-300">
              <CardBody>
                <p className="line-clamp-2 text-sm font-medium text-slate-800">{w.original_query}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={w.language === "hi" ? "amber" : "teal"}>{w.language === "hi" ? "हिंदी" : "EN"}</Badge>
                  <Badge tone="slate">{w.run_count} runs</Badge>
                  <Badge tone="slate">{w.record_count} records</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-400">last run: {fmtIST(w.last_run_at)}</p>
              </CardBody>
            </Card>
          </button>
        ))}
      </div>

      {detail ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Run timeline" subtitle={`${detail.runs.length} runs · trigger shown per run`} />
            <CardBody className="p-0">
              <ul className="slim-scroll max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {detail.runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <div>
                      <p className="font-mono text-xs text-slate-500">{r.id.slice(0, 8)}</p>
                      <p className="text-xs text-slate-500">
                        {fmtIST(r.started_at)} · {r.trigger}
                        {r.stats?.accepted !== undefined ? ` · ${r.stats.accepted} accepted` : ""}
                      </p>
                    </div>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Run comparison" subtitle={summary ?? "Latest vs previous"} />
            <CardBody className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Run A (earlier)</p>
                  <Select
                    value={runA || diff?.runA.id || ""}
                    onChange={(e) => {
                      setRunA(e.target.value);
                      loadDiff(selected!, e.target.value, runB || diff!.runB.id);
                    }}
                  >
                    {(diff?.runs ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {fmtIST(r.started_at)} ({r.trigger})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Run B (later)</p>
                  <Select
                    value={runB || diff?.runB.id || ""}
                    onChange={(e) => {
                      setRunB(e.target.value);
                      loadDiff(selected!, runA || diff!.runA.id, e.target.value);
                    }}
                  >
                    {(diff?.runs ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {fmtIST(r.started_at)} ({r.trigger})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {!diff ? (
                <EmptyState message="Run this workflow a second time to see a comparison." />
              ) : (
                <>
                  <Tabs
                    active={tab}
                    onChange={setTab}
                    tabs={[
                      { id: "new", label: `NEW (${diff.buckets.new.length})` },
                      { id: "changed", label: `CHANGED (${diff.buckets.changed.length})` },
                      { id: "missing", label: `MISSING (${diff.buckets.missing.length})` },
                      { id: "unchanged", label: `UNCHANGED (${diff.buckets.unchanged.length})` },
                    ]}
                  />
                  <div className="slim-scroll max-h-80 overflow-y-auto">
                    {tab === "new" &&
                      (diff.buckets.new.length === 0 ? (
                        <p className="p-3 text-sm text-slate-500">No new records — nothing appeared in run B that wasn't in run A.</p>
                      ) : (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {diff.buckets.new.map((r) => (
                            <li key={r.identity_key} className="px-3 py-2">
                              <Badge tone="green" className="mr-2">new</Badge>
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      ))}
                    {tab === "changed" &&
                      (diff.buckets.changed.length === 0 ? (
                        <p className="p-3 text-sm text-slate-500">No changed records.</p>
                      ) : (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {diff.buckets.changed.map((r) => (
                            <li key={r.identity_key} className="px-3 py-2">
                              <p className="font-medium text-slate-800">
                                <Badge tone="amber" className="mr-2">changed</Badge>
                                {r.name}
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {(r.fieldDeltas ?? []).map((d, i) => (
                                  <li key={i} className="text-xs text-slate-600">
                                    <span className="font-medium">{allFields.find((f) => f.key === d.field)?.label ?? d.field}:</span>{" "}
                                    <span className="text-slate-400 line-through">{d.before || "(empty)"}</span> → <span className="text-teal-700">{d.after || "(empty)"}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      ))}
                    {tab === "missing" &&
                      (diff.buckets.missing.length === 0 ? (
                        <p className="p-3 text-sm text-slate-500">No missing records.</p>
                      ) : (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {diff.buckets.missing.map((r) => (
                            <li key={r.identity_key} className="px-3 py-2">
                              <Badge tone="red" className="mr-2">missing</Badge>
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      ))}
                    {tab === "unchanged" &&
                      (diff.buckets.unchanged.length === 0 ? (
                        <p className="p-3 text-sm text-slate-500">No unchanged records.</p>
                      ) : (
                        <ul className="divide-y divide-slate-100 text-sm">
                          {diff.buckets.unchanged.map((r) => (
                            <li key={r.identity_key} className="px-3 py-2">
                              <Badge tone="slate" className="mr-2">unchanged</Badge>
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
