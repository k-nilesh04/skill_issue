"use client";
// Results — searchable/filterable/sortable record table with column visibility,
// per-record detail drawer with per-field provenance, CSV export, sample toggle.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, Checkbox, Drawer, EmptyState, Input, ProgressBar, Select, Skeleton, Slider, fmtIST } from "@/components/ui";
import { allFields } from "@/lib/field-list";

type RecordRow = {
  id: string;
  fields: Record<string, string>;
  data: Record<string, { value: string; source_url: string; quote: string; confidence: number }>;
  source_adapter: string;
  source_url: string | null;
  completeness: number;
  confidence: number;
  verification: string;
  status: string;
  rejection_reason: string | null;
  sample: boolean;
  change_state: string | null;
  created_at: string;
};
type Workflow = { id: string; title: string };

const ALL_COLUMNS = ["event_name", "organiser", "start_date", "city", "venue", "mode", "registration_deadline", "registration_url", "tags"];

function ResultsInner() {
  const sp = useSearchParams();
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [workflowId, setWorkflowId] = useState<string>("");
  const [records, setRecords] = useState<RecordRow[] | null>(null);
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [minCompleteness, setMinCompleteness] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showSample, setShowSample] = useState(true);
  const [includeRejected, setIncludeRejected] = useState(false);
  const [sort, setSort] = useState("created_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [columns, setColumns] = useState<string[]>(ALL_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [drawer, setDrawer] = useState<RecordRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/workflows", { cache: "no-store" });
        const data = await res.json();
        setWorkflows(data.workflows ?? []);
        const prefer = sp.get("workflow") || (sp.get("workflowRun") ? null : null);
        const list: Workflow[] = data.workflows ?? [];
        const chosen = prefer ?? list[0]?.id ?? "";
        setWorkflowId(chosen);
      } catch {
        setWorkflows([]);
      }
    })();
  }, [sp]);

  const load = useCallback(async () => {
    if (!workflowId) return;
    const params = new URLSearchParams({
      workflowId,
      q,
      source,
      minCompleteness: String(minCompleteness / 100),
      verifiedOnly: verifiedOnly ? "1" : "0",
      includeRejected: includeRejected ? "1" : "0",
      sample: showSample ? "1" : "0",
      sort,
      dir,
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const res = await fetch(`/api/records?${params}`, { cache: "no-store" });
      const data = await res.json();
      setRecords(data.records ?? []);
    } catch {
      setRecords([]);
    }
  }, [workflowId, q, source, minCompleteness, verifiedOnly, includeRejected, showSample, sort, dir, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleSort(col: string) {
    if (sort === col) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(col);
      setDir("asc");
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({
      workflowId,
      q,
      source,
      minCompleteness: String(minCompleteness / 100),
      verifiedOnly: verifiedOnly ? "1" : "0",
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    window.open(`/api/export/csv?${params}`, "_blank");
  }

  const sources = useMemo(() => {
    const s = new Set<string>();
    records?.forEach((r) => s.add(r.source_adapter));
    return [...s];
  }, [records]);

  return (
    <>
      <PageHeader title="Results" subtitle="Structured records with per-field provenance. Click a row for the full audit trail." />

      <Card className="mb-4">
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-64">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
              <Select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} aria-label="Select workflow">
                {(workflows ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Search</p>
              <Input placeholder='e.g. "hackathon"' value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search records" />
            </div>
            <div className="w-36">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
              <Select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source adapter">
                <option value="">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="md" onClick={exportCsv}>
                Export CSV
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Min completeness: {minCompleteness}%</p>
              <Slider value={minCompleteness} onChange={setMinCompleteness} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date from</p>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date to</p>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Checkbox label="Verified only" checked={verifiedOnly} onChange={setVerifiedOnly} />
              <Checkbox label="Show sample data" checked={showSample} onChange={setShowSample} />
              <Checkbox label="Show rejected" checked={includeRejected} onChange={setIncludeRejected} />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <p className="text-xs text-slate-500">{records ? `${records.length} records` : "Loading…"}</p>
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setShowColumns(!showColumns)} aria-expanded={showColumns}>
              Columns
            </Button>
            {showColumns ? (
              <div className="absolute right-0 z-10 mt-1 w-56 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                {ALL_COLUMNS.map((c) => (
                  <Checkbox
                    key={c}
                    label={allFields.find((f) => f.key === c)?.label ?? c}
                    checked={columns.includes(c)}
                    onChange={(v) => setColumns(v ? [...columns, c] : columns.filter((x) => x !== c))}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {!records ? (
          <CardBody className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </CardBody>
        ) : records.length === 0 ? (
          <EmptyState message="No records match these filters. Loosen the filters or run a new collection." actionLabel="New Collection" onAction={() => (window.location.href = "/new")} />
        ) : (
          <div className="slim-scroll overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="sticky top-0 bg-white px-3 py-2 font-semibold">Status</th>
                  {columns.map((c) => (
                    <th key={c} className="sticky top-0 cursor-pointer bg-white px-3 py-2 font-semibold hover:text-teal-700" onClick={() => toggleSort(c)}>
                      {allFields.find((f) => f.key === c)?.label ?? c}
                      {sort === c ? <span className="ml-1">{dir === "asc" ? "▲" : "▼"}</span> : null}
                    </th>
                  ))}
                  <th className="sticky top-0 bg-white px-3 py-2 font-semibold">Source</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-semibold">Completeness</th>
                  <th className="sticky top-0 bg-white px-3 py-2 font-semibold">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDrawer(r)}>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.status === "rejected" ? (
                        <Badge tone="red">rejected</Badge>
                      ) : r.verification === "verified" ? (
                        <Badge tone="green">verified</Badge>
                      ) : r.verification === "missing_fields" ? (
                        <Badge tone="amber">missing</Badge>
                      ) : (
                        <Badge tone="slate">unverified</Badge>
                      )}
                      {r.sample ? <Badge tone="outline" className="ml-1">SAMPLE</Badge> : null}
                    </td>
                    {columns.map((c) => (
                      <td key={c} className="max-w-48 truncate px-3 py-2 text-slate-700" title={r.fields[c] ?? ""}>
                        {c.endsWith("date") && r.fields[c] ? <span className="font-mono">{r.fields[c]}</span> : r.fields[c] || <span className="text-slate-300">—</span>}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-500">{r.source_adapter}</td>
                    <td className="px-3 py-2">
                      <ProgressBar value={r.completeness} />
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.confidence >= 0.9 ? "green" : "amber"}>{r.confidence >= 0.9 ? "high" : "medium"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Record detail drawer */}
      <Drawer open={!!drawer} onClose={() => setDrawer(null)} title={drawer?.fields.event_name ?? "Record"}>
        {drawer ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {drawer.sample ? <Badge tone="outline">SAMPLE</Badge> : null}
              <Badge tone={drawer.verification === "verified" ? "green" : drawer.verification === "missing_fields" ? "amber" : "slate"}>{drawer.verification.replace("_", " ")}</Badge>
              <Badge tone="slate">{drawer.source_adapter}</Badge>
              {drawer.change_state ? <Badge tone="teal">{drawer.change_state}</Badge> : null}
              <Badge tone="slate">created {fmtIST(drawer.created_at)}</Badge>
            </div>
            {drawer.status === "rejected" ? <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">Rejected: {drawer.rejection_reason}</p> : null}
            {allFields
              .filter((f) => drawer.data[f.key] || drawer.fields[f.key])
              .map((f) => {
                const pv = drawer.data[f.key];
                return (
                  <div key={f.key} className="rounded-md border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{f.label}</p>
                    <p className="mt-0.5 text-sm text-slate-800">
                      {f.key.endsWith("url") && pv?.value ? (
                        <a href={pv.value} target="_blank" rel="noopener noreferrer" className="break-all text-teal-700 hover:underline">
                          {pv.value}
                        </a>
                      ) : (
                        pv?.value ?? drawer.fields[f.key]
                      )}
                    </p>
                    {pv?.quote ? (
                      <p className="mt-1 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500">&ldquo;{pv.quote}&rdquo;</p>
                    ) : null}
                    {pv ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        provenance:{" "}
                        {pv.source_url ? (
                          <a href={pv.source_url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                            {pv.source_url.slice(0, 60)}…
                          </a>
                        ) : (
                          "—"
                        )}{" "}
                        · confidence {pv.confidence >= 1 ? "high" : "medium"}
                      </p>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <ResultsInner />
    </Suspense>
  );
}
