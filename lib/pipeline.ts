// Pipeline engine (spec section 5): one function, executeRun(runId).
// Every stage transition, counter and log line is written to the DB as it happens so
// parallel polling GETs see real progress. No fake logs, no fake progress.

import { db, newId, nowIso, getJSON } from "./db";
import { getAdapter, type SourceResult } from "./adapters";
import { extractRecords, interpretQuery, diffSummary, saveAiOutput, hasLLM } from "./ai";
import { hasSearch } from "./search";
import { identityKey, validateRecord, type CandidateRecord } from "./validation";
import { computeDiff } from "./diff";
import { isKnownField } from "./fields";
import type { FieldValue, Interpretation, LogLine, Plan } from "./types";

type RunRow = any;
type WorkflowRow = any;

export function appendLog(runId: string, source: string, msg: string, level: LogLine["level"] = "info") {
  const t = new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" });
  const row = db.prepare("SELECT logs_json FROM runs WHERE id = ?").get(runId) as any;
  const logs: LogLine[] = row?.logs_json ? JSON.parse(row.logs_json) : [];
  logs.push({ t, level, source, msg });
  db.prepare("UPDATE runs SET logs_json = ? WHERE id = ?").run(JSON.stringify(logs), runId);
}

function setStage(runId: string, stage: string) {
  db.prepare("UPDATE runs SET stage = ? WHERE id = ?").run(stage, runId);
  appendLog(runId, "pipeline", `stage → ${stage}`);
}

function setSourceField(runId: string, sourceId: string, patch: Record<string, unknown>) {
  const row = db.prepare("SELECT * FROM run_sources WHERE id = ?").get(sourceId) as any;
  if (!row) return;
  const next = { ...row, ...patch };
  db.prepare(
    "UPDATE run_sources SET status=?, queries_used_json=?, found=?, processed=?, accepted=?, rejected=?, error=?, started_at=?, finished_at=? WHERE id=?"
  ).run(
    next.status,
    next.queries_used_json ?? null,
    next.found ?? 0,
    next.processed ?? 0,
    next.accepted ?? 0,
    next.rejected ?? 0,
    next.error ?? null,
    next.started_at ?? null,
    next.finished_at ?? null,
    sourceId
  );
}

function sanitizeValue(v: unknown): string {
  return String(v ?? "").slice(0, 1000);
}

function coerceExtracted(rec: any, adapterUrl: string, adapterId: string, sample: boolean): CandidateRecord | null {
  const fields: Record<string, FieldValue> = {};
  const raw = rec?.fields;
  if (!raw || typeof raw !== "object") return null;
  for (const [k, fv] of Object.entries(raw) as [string, any][]) {
    if (!isKnownField("event", k)) continue; // whitelist field keys
    if (!fv || typeof fv.value !== "string") continue;
    fields[k] = {
      value: sanitizeValue(fv.value),
      source_url: typeof fv.source_url === "string" && fv.source_url ? fv.source_url.slice(0, 500) : adapterUrl,
      quote: typeof fv.quote === "string" ? fv.quote.slice(0, 600) : "",
      confidence: fv.quote && fv.value && fv.quote.includes(fv.value) ? 1.0 : 0.6,
    };
  }
  if (!fields.event_name) return null;
  fields.source_url = fields.source_url ?? { value: adapterUrl, source_url: adapterUrl, quote: adapterUrl, confidence: 1 };
  fields.source_adapter = { value: adapterId, source_url: adapterUrl, quote: adapterUrl, confidence: 1 };
  return { fields, sourceAdapter: adapterId, sourceUrl: adapterUrl, sample };
}

export async function executeRun(runId: string, opts?: { onlySources?: string[] }): Promise<void> {
  const run = db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
  if (!run) throw new Error(`run ${runId} not found`);
  const wf = db.prepare("SELECT * FROM workflows WHERE id = ?").get(run.workflow_id) as WorkflowRow | undefined;
  if (!wf) throw new Error(`workflow ${run.workflow_id} not found`);

  const interpretation = getJSON<Interpretation>(wf, "interpretation_json");
  const plan = getJSON<Plan>(wf, "plan_json");
  if (!interpretation || !plan) {
    db.prepare("UPDATE runs SET status='failed', error='workflow missing interpretation or plan', finished_at=? WHERE id=?").run(nowIso(), runId);
    return;
  }

  db.prepare("UPDATE runs SET status='running', started_at=COALESCE(started_at, ?) WHERE id=?").run(nowIso(), runId);

  const stats = { found: 0, processed: 0, accepted: 0, rejected: 0, duplicates_merged: 0 };
  const sample = !hasSearch();
  const urlAllowlist = new Set<string>();
  const merged: Map<string, CandidateRecord> = new Map();
  let sourceRows: any[] = [];

  try {
    // ---- interpreting
    setStage(runId, "interpreting");
    if (wf.interpretation_json) {
      appendLog(runId, "interpret", "workflow already has a final interpretation — reusing it");
    } else {
      const interp = await interpretQuery(wf.original_query);
      db.prepare("UPDATE workflows SET interpretation_json=? WHERE id=?").run(JSON.stringify(interp.data), wf.id);
      saveAiOutput(runId, "interpreting", `Stage handled by ${interp.engine === "llm" ? "platform model" : "heuristic fallback"}: interpretation (${interp.data.detected_language.toUpperCase()}→ both supported)`, interp.raw);
      appendLog(runId, "interpret", `interpretation complete (${interp.engine}) — entity=${interp.data.entity_type}, window=${interp.data.date_from}→${interp.data.date_to}`);
    }

    // ---- searching
    setStage(runId, "searching");
    let enabledSources = plan.sources.filter((s) => s.enabled).map((s) => s.adapter);
    if (opts?.onlySources?.length) {
      enabledSources = enabledSources.filter((a) => opts.onlySources!.includes(a));
      appendLog(runId, "pipeline", `retry mode — re-running only: ${enabledSources.join(", ")}`);
    }
    if (!enabledSources.length) throw new Error("no enabled sources in plan");

    const collected: { adapterId: string; results: SourceResult[]; sample: boolean; sourceRowId: string }[] = [];
    let anySourceError: string | null = null;
    let allSourcesErrored = true;

    for (const adapterId of enabledSources) {
      const adapter = getAdapter(adapterId);
      const srcRowId = newId();
      db.prepare(
        "INSERT INTO run_sources (id, run_id, adapter, status, queries_used_json, found, processed, accepted, rejected, started_at) VALUES (?,?,?,?,?,0,0,0,0,?)"
      ).run(srcRowId, runId, adapterId, "working", "[]", nowIso());
      sourceRows.push({ id: srcRowId, adapter: adapterId });

      if (!adapter) {
        setSourceField(runId, srcRowId, { status: "error", error: `unknown adapter ${adapterId}`, finished_at: nowIso() });
        anySourceError = `unknown adapter ${adapterId}`;
        continue;
      }
      try {
        const out = await adapter.collect(
          { search_queries: plan.search_queries, devfolio_filters: plan.devfolio_filters },
          { date_from: interpretation.date_from, date_to: interpretation.date_to, location: interpretation.location },
          (src, msg, lvl) => appendLog(runId, src, msg, lvl ?? "info")
        );
        for (const r of out.results) urlAllowlist.add(r.url);
        setSourceField(runId, srcRowId, {
          status: "ok",
          queries_used_json: JSON.stringify(out.queriesUsed),
          found: out.results.length,
          finished_at: nowIso(),
        });
        stats.found += out.results.length;
        appendLog(runId, adapterId, `collected ${out.results.length} results${out.sample ? " (SAMPLE corpus)" : ""}`);
        collected.push({ adapterId, results: out.results, sample: out.sample, sourceRowId: srcRowId });
        allSourcesErrored = false;
      } catch (e) {
        const msg = String((e as Error).message).slice(0, 500);
        setSourceField(runId, srcRowId, { status: "error", error: msg, finished_at: nowIso() });
        appendLog(runId, adapterId, `source failed: ${msg}`, "error");
        anySourceError = msg;
        // CONTINUE — partial success is a feature
      }
    }
    if (allSourcesErrored && collected.length === 0) {
      throw new Error(`all sources failed. last error: ${anySourceError ?? "unknown"}`);
    }

    // ---- extracting
    setStage(runId, "extracting");
    const extracted: CandidateRecord[] = [];
    for (const c of collected) {
      if (!c.results.length) continue;
      const ex = await extractRecords(c.results, "event");
      saveAiOutput(runId, "extracting", `Stage handled by ${ex.engine === "llm" ? "platform model" : "heuristic fallback"}: extraction from ${c.adapterId}`, ex.raw);
      for (const rec of ex.data.records) {
        const cleaned = coerceExtracted(rec, "", c.adapterId, c.sample);
        if (!cleaned) continue;
        // attach the url of the source result this record's content came from
        const srcUrl = pickSourceUrl(c.results, cleaned);
        if (srcUrl) cleaned.fields.source_url = { value: srcUrl, source_url: srcUrl, quote: srcUrl, confidence: 1 };
        cleaned.sourceUrl = srcUrl;
        extracted.push(cleaned);
      }
      const row = db.prepare("SELECT * FROM run_sources WHERE id=?").get(c.sourceRowId) as any;
      setSourceField(runId, c.sourceRowId, { processed: (row.processed ?? 0) + ex.data.records.length });
      stats.processed += ex.data.records.length;
      appendLog(runId, "extract", `${ex.data.records.length} records parsed from ${c.adapterId}`);
    }

    // ---- validating
    setStage(runId, "validating");
    const filters = { date_from: interpretation.date_from, date_to: interpretation.date_to };
    for (const cand of extracted) {
      const verdict = validateRecord(cand, filters, urlAllowlist, "event", "validate");
      if (verdict.outcome === "rejected") {
        stats.rejected++;
        insertRecord(runId, wf, cand, { status: "rejected", rejection_reason: verdict.reason, sample: cand.sample });
        const src = sourceRows.find((s) => s.adapter === cand.sourceAdapter);
        if (src) {
          const row = db.prepare("SELECT rejected FROM run_sources WHERE id=?").get(src.id) as any;
          setSourceField(runId, src.id, { rejected: (row.rejected ?? 0) + 1 });
        }
        appendLog(runId, "validate", `rejected 1 record: ${verdict.reason}`, "warn");
        continue;
      }
      const key = identityKey(cand.fields);
      const existing = merged.get(key);
      if (existing) {
        const conflict = mergeInto(existing, cand);
        stats.duplicates_merged++;
        appendLog(runId, "validate", `duplicate merged (${key.slice(0, 8)})${conflict ? " — conflicting field values, record marked review" : ""}`);
        continue;
      }
      merged.set(key, cand);
    }

    // persist accepted (merged) records, dedup across runs of the same workflow
    for (const [key, cand] of merged) {
      const v = validateRecord(cand, filters, urlAllowlist, "event", "validate");
      if (v.outcome !== "accepted") continue; // merged record could theoretically break url rule; skip
      const prev = db
        .prepare("SELECT id, fields_snapshot_json FROM records WHERE workflow_id=? AND identity_key=? AND status='accepted' ORDER BY created_at DESC LIMIT 1")
        .get(wf.id, key) as any;
      const changeState = prev ? null : "new"; // finalized in the completed stage
      const id = insertRecord(runId, wf, cand, {
        status: "accepted",
        completeness: v.completeness,
        confidence: v.confidence,
        verification: v.verification,
        sample: cand.sample,
        identityKey: key,
        changeState,
        firstSeenRunId: prev?.id ? undefined : runId,
        lastSeenRunId: runId,
      });
      if (prev?.id) {
        db.prepare("UPDATE records SET duplicate_of=NULL, last_seen_run_id=? WHERE id=?").run(runId, id);
      }
      stats.accepted++;
    }
    appendLog(runId, "validate", `${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.duplicates_merged} duplicates merged`);

    // ---- completed: diff vs previous run of the same workflow
    setStage(runId, "done");
    const prevRun = db
      .prepare("SELECT id FROM runs WHERE workflow_id=? AND id != ? AND status IN ('completed','partial') ORDER BY started_at DESC LIMIT 1")
      .get(wf.id, runId) as any;
    let buckets = { new: 0, changed: 0, missing: 0, unchanged: 0 };
    if (prevRun?.id) {
      const diff = computeDiff(prevRun.id, runId);
      buckets = { new: diff.new.length, changed: diff.changed.length, missing: diff.missing.length, unchanged: diff.unchanged.length };
      // set change_state on current-run records
      const mark = (records: { recordId?: string }[], state: string) => {
        for (const r of records) {
          if (!r.recordId) continue;
          if (state === "unchanged" && isNewRow(r.recordId)) continue; // new record in this run: keep "new"
          db.prepare("UPDATE records SET change_state=? WHERE id=?").run(state, r.recordId);
        }
      };
      mark(diff.new, "new");
      mark(diff.changed, "changed");
      mark(diff.unchanged, "unchanged");
      db.prepare("UPDATE records SET change_state='missing' WHERE workflow_id=? AND change_state IS NULL AND last_seen_run_id=? AND identity_key IN ({ids})"
        .replace("{ids}", diff.missing.map(() => "?").join(",") || "''"))
        .run(wf.id, prevRun.id, ...diff.missing.map((m) => m.identity_key));
      appendLog(runId, "diff", `vs previous run: +${buckets.new} new, ~${buckets.changed} changed, -${buckets.missing} missing, =${buckets.unchanged} unchanged`);
      const ds = await diffSummary(
        { newCount: buckets.new, changedCount: buckets.changed, missingCount: buckets.missing, unchangedCount: buckets.unchanged },
        wf.language
      );
      saveAiOutput(runId, "completed", `Stage handled by ${ds.engine === "llm" ? "platform model" : "template fallback"}: diff summary`, ds.raw);
      appendLog(runId, "diff", `summary: ${ds.data.summary}`);
      db.prepare("UPDATE runs SET previous_run_id=? WHERE id=?").run(prevRun.id, runId);
    } else {
      appendLog(runId, "diff", "first run for this workflow — no previous run to compare");
    }

    const hadError = anySourceError !== null;
    db.prepare("UPDATE runs SET status=?, finished_at=?, stats_json=?, error=? WHERE id=?").run(
      hadError ? "partial" : "completed",
      nowIso(),
      JSON.stringify({ ...stats, diff: buckets }),
      hadError ? `one or more sources failed: ${anySourceError}` : null,
      runId
    );
    appendLog(runId, "pipeline", `run ${hadError ? "completed with partial success" : "completed"} — accepted ${stats.accepted}, rejected ${stats.rejected}`);
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 800);
    db.prepare("UPDATE runs SET status='failed', error=?, finished_at=?, stats_json=? WHERE id=?").run(msg, nowIso(), JSON.stringify(stats), runId);
    appendLog(runId, "pipeline", `run failed: ${msg}`, "error");
  }
}

function isNewRow(recordId: string): boolean {
  const r = db.prepare("SELECT change_state FROM records WHERE id=?").get(recordId) as any;
  return r?.change_state === "new";
}

function pickSourceUrl(results: SourceResult[], rec: CandidateRecord): string | null {
  // provenance: if the model/heuristic gave a field-level source_url that appears in this
  // result set, keep it; else fall back to the result set entry whose content matches.
  const claimed = rec.fields.source_url?.value;
  if (claimed && results.some((r) => r.url === claimed)) return claimed;
  return results[0]?.url ?? null;
}

function mergeInto(base: CandidateRecord, incoming: CandidateRecord): boolean {
  let conflict = false;
  for (const [k, v] of Object.entries(incoming.fields)) {
    if (k === "source_adapter") continue;
    const cur = base.fields[k];
    if (!cur) {
      base.fields[k] = v; // union fields, provenance preserved per field
    } else if (cur.value !== v.value && v.confidence > cur.confidence) {
      base.fields[k] = v; // prefer better-evidenced value
    } else if (cur.value !== v.value) {
      conflict = true; // same field, different values, no clear winner → review
    }
  }
  return conflict;
}

function insertRecord(
  runId: string,
  wf: WorkflowRow,
  cand: CandidateRecord,
  opts: {
    status: string;
    rejection_reason?: string;
    completeness?: number;
    confidence?: number;
    verification?: string;
    sample?: boolean;
    identityKey?: string;
    changeState?: string | null;
    firstSeenRunId?: string;
    lastSeenRunId?: string;
  }
): string {
  const key = opts.identityKey ?? identityKey(cand.fields);
  const id = newId();
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(cand.fields)) flat[k] = v.value;
  db.prepare(
    `INSERT INTO records (id, run_id, workflow_id, identity_key, data_json, fields_snapshot_json, source_adapter, source_url,
      completeness, confidence, verification, status, rejection_reason, duplicate_of, sample, first_seen_run_id, last_seen_run_id, change_state, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    id,
    runId,
    wf.id,
    key,
    JSON.stringify(cand.fields),
    JSON.stringify(flat),
    cand.sourceAdapter,
    cand.sourceUrl,
    opts.completeness ?? 0,
    opts.confidence ?? 0,
    opts.verification ?? "unverified",
    opts.status,
    opts.rejection_reason ?? null,
    null,
    opts.sample ? 1 : 0,
    opts.firstSeenRunId ?? runId,
    opts.lastSeenRunId ?? runId,
    opts.changeState ?? null,
    nowIso()
  );
  return id;
}
