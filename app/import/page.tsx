"use client";
// Import Dataset — drag-drop CSV upload → column mapping (model-suggested, editable)
// → validation preview with per-row reasons → commit summary.

import { useCallback, useRef, useState } from "react";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Select, Skeleton } from "@/components/ui";
import { allFields } from "@/lib/field-list";

type Analyze = {
  filename: string;
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  mappingEngine: string;
  previewRows: string[][];
  rowCount: number;
};
type Commit = {
  imported: number;
  skipped_duplicates: number;
  invalid: number;
  verdicts: { row: number; ok: boolean; reason?: string }[];
  workflow_id: string;
};

export default function ImportPage() {
  const [analyze, setAnalyze] = useState<Analyze | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [commit, setCommit] = useState<Commit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvText = useRef<string>("");

  const upload = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setCommit(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/import/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "analysis failed");
      csvText.current = await file.text();
      setAnalyze(data);
      setMapping(data.suggestedMapping ?? {});
    } catch (e) {
      setError((e as Error).message);
      setAnalyze(null);
    } finally {
      setBusy(false);
    }
  }, []);

  async function doCommit() {
    if (!analyze) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: analyze.filename, csv: csvText.current, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "import failed");
      setCommit(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Import Dataset" subtitle="Bring your own CSV — records enter the same validation and dedup flow, tagged USER IMPORT." />

      {/* Step 0: upload */}
      {!analyze ? (
        <Card>
          <CardBody>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 text-center ${dragOver ? "border-teal-600 bg-teal-50" : "border-slate-300"}`}
            >
              <p className="text-sm text-slate-600">Drag &amp; drop a CSV file here (max 2MB), or</p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                Browse files
              </Button>
              {busy ? <Skeleton className="h-4 w-40" /> : null}
              {error ? (
                <p className="text-sm text-red-600">
                  {error}{" "}
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    Retry
                  </Button>
                </p>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Step 1: mapping */}
          <Card className="mb-6">
            <CardHeader
              title="Step 1 — Column mapping"
              subtitle={`${analyze.filename} · ${analyze.rowCount} rows · mapping suggested by ${analyze.mappingEngine === "llm" ? "platform model" : "heuristic fallback"}`}
              action={
                <Button variant="outline" size="sm" onClick={() => { setAnalyze(null); setCommit(null); }}>
                  Start over
                </Button>
              }
            />
            <CardBody>
              <div className="slim-scroll overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-semibold">CSV column</th>
                      <th className="px-3 py-2 font-semibold">Sample value</th>
                      <th className="px-3 py-2 font-semibold">Maps to schema field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyze.headers.map((h, i) => (
                      <tr key={h} className="border-b border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{h}</td>
                        <td className="max-w-48 truncate px-3 py-2 font-mono text-xs text-slate-500">{analyze.previewRows[0]?.[i] ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Select
                            className="h-8 w-56 text-xs"
                            value={mapping[h] ?? ""}
                            onChange={(e) => setMapping({ ...mapping, [h]: e.target.value || null })}
                            aria-label={`Map column ${h}`}
                          >
                            <option value="">— skip column —</option>
                            {allFields.map((f) => (
                              <option key={f.key} value={f.key}>
                                {f.label}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={doCommit} disabled={busy}>
                  {busy ? "Validating & importing…" : "Validate & import →"}
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Step 2/3: validation + summary */}
          {commit ? (
            <Card>
              <CardHeader
                title="Step 3 — Import summary"
                action={
                  <div className="flex gap-2">
                    <Badge tone="green">{commit.imported} imported</Badge>
                    <Badge tone="red">{commit.invalid} skipped</Badge>
                    {commit.skipped_duplicates ? <Badge tone="amber">{commit.skipped_duplicates} duplicates</Badge> : null}
                  </div>
                }
              />
              <CardBody className="p-0">
                <ul className="slim-scroll max-h-96 divide-y divide-slate-100 overflow-y-auto">
                  {commit.verdicts.map((v) => (
                    <li key={v.row} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <Badge tone={v.ok ? "green" : "red"}>row {v.row}</Badge>
                      <span className="text-slate-600">{v.ok ? "imported" : v.reason}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </>
      )}

      {!analyze && !busy && !error ? null : null}
      {!analyze ? null : !commit ? <p className="mt-4 text-xs text-slate-500">Rows are validated on commit: required fields (event_name, start_date, source_url), date parse, URL format, and duplicates against existing records.</p> : null}
      {!analyze ? null : <div className="mt-2">{!commit ? <EmptyState message="Preview shows the first 10 rows above — mapping is fully editable before commit." /> : null}</div>}
    </>
  );
}
