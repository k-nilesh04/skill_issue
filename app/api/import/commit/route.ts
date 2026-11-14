import { NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import { createHash } from "node:crypto";
import { schemaFor, isKnownField } from "@/lib/fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RowVerdict = { row: number; ok: boolean; reason?: string };

// POST /api/import/commit — {filename, csv (raw text), mapping: {header: fieldKey|null}, workflowId?}
// Validates rows, inserts Records with source_adapter="csv_upload", tagged USER IMPORT.
export async function POST(req: Request) {
  const body = await req.json();
  const { filename, csv, mapping } = body ?? {};
  if (!filename || !csv || !mapping) return NextResponse.json({ error: "filename, csv and mapping required" }, { status: 400 });

  let workflowId: string | null = body?.workflowId ?? null;
  if (!workflowId) {
    // import into the most recent workflow, or create a holding workflow
    const wf = db.prepare("SELECT id FROM workflows ORDER BY updated_at DESC LIMIT 1").get() as any;
    if (wf) workflowId = wf.id;
    else {
      workflowId = newId();
      const now = nowIso();
      db.prepare(
        "INSERT INTO workflows (id, title, original_query, language, interpretation_json, plan_json, entity_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
      ).run(workflowId, `Imported dataset: ${filename}`.slice(0, 60), `Imported dataset: ${filename}`, "en", null, null, "event", now, now);
    }
  }

  const rows = parseCSV(csv);
  if (rows.length === 0) return NextResponse.json({ error: "file is empty" }, { status: 400 });
  const headers = rows[0];
  const dataRows = rows.slice(1);

  // reverse mapping: fieldKey -> header index
  const fieldIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    const fk = mapping[h];
    if (fk && isKnownField("event", fk) && !(fk in fieldIndex)) fieldIndex[fk] = i;
  });
  if (fieldIndex["event_name"] === undefined || fieldIndex["start_date"] === undefined || fieldIndex["source_url"] === undefined) {
    return NextResponse.json(
      { error: "mapping must include event_name, start_date and source_url (required fields)" },
      { status: 400 }
    );
  }

  const runId = newId();
  db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json, finished_at) VALUES (?,?,?,?,?,?,?,?)").run(
    runId,
    workflowId,
    "manual",
    "completed",
    "done",
    nowIso(),
    JSON.stringify([
      { t: new Date().toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" }), level: "info", source: "import", msg: `CSV import "${filename}" — ${dataRows.length} rows` },
    ]),
    nowIso()
  );

  const existingKeys = new Set<string>(
    (db.prepare("SELECT identity_key FROM records WHERE workflow_id=? AND status='accepted'").all(workflowId) as any[]).map((r) => r.identity_key)
  );

  const verdicts: RowVerdict[] = [];
  let imported = 0;
  let skippedDuplicates = 0;
  const now = nowIso();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const get = (fk: string) => (fieldIndex[fk] !== undefined ? (row[fieldIndex[fk]] ?? "").trim() : "");
    const name = get("event_name");
    const startDate = get("start_date");
    const sourceUrl = get("source_url");

    let reason: string | null = null;
    if (!name) reason = "missing required field: event_name";
    else if (!startDate) reason = "missing required field: start_date";
    else if (!sourceUrl) reason = "missing required field: source_url";
    else if (isNaN(new Date(`${startDate}T00:00:00Z`).getTime())) reason = `invalid date "${startDate}"`;
    else if (!/^https?:\/\//i.test(sourceUrl)) reason = `invalid URL "${sourceUrl}"`;

    const fields: Record<string, { value: string; source_url: string; quote: string; confidence: number }> = {};
    if (!reason) {
      const idKey = createHash("sha1")
        .update(`${name.toLowerCase()}|${(get("city") || "unknown").toLowerCase()}|${startDate.toLowerCase()}`)
        .digest("hex");
      if (existingKeys.has(idKey)) {
        reason = `duplicate of an existing record (${name})`;
        skippedDuplicates++;
      } else {
        existingKeys.add(idKey);
      }
    }

    if (reason) {
      verdicts.push({ row: i + 2, ok: false, reason }); // +2: 1-based rows + header
      continue;
    }

    for (const [fk, idx] of Object.entries(fieldIndex)) {
      const v = (row[idx] ?? "").trim();
      if (v) fields[fk] = { value: v.slice(0, 1000), source_url: sourceUrl, quote: v, confidence: 1.0 };
    }
    fields.source_adapter = { value: "csv_upload", source_url: sourceUrl, quote: filename, confidence: 1.0 };

    const required = schemaFor("event").filter((f) => f.required);
    const filled = required.filter((f) => fields[f.key]?.value?.trim()).length;
    const completeness = filled / required.length;
    const missing = required.filter((f) => !fields[f.key]?.value?.trim());
    const verification = missing.length ? "missing_fields" : "verified";

    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) flat[k] = v.value;
    const idKey = createHash("sha1")
      .update(`${name.toLowerCase()}|${(get("city") || "unknown").toLowerCase()}|${startDate.toLowerCase()}`)
      .digest("hex");

    db.prepare(
      `INSERT INTO records (id, run_id, workflow_id, identity_key, data_json, fields_snapshot_json, source_adapter, source_url,
        completeness, confidence, verification, status, sample, first_seen_run_id, last_seen_run_id, change_state, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,'accepted',0,?,?,?,?)`
        .replace("'accepted',0,?,?,?,?", "'accepted',0,1,?,?,?")
    ).run(
      newId(),
      runId,
      workflowId,
      idKey,
      JSON.stringify(fields),
      JSON.stringify(flat),
      "csv_upload",
      sourceUrl,
      completeness,
      1.0,
      verification,
      now,
      runId,
      runId,
      null,
      now
    );
    imported++;
    verdicts.push({ row: i + 2, ok: true });
  }

  const impId = newId();
  db.prepare("INSERT INTO imports (id, filename, mapping_json, row_count, valid_count, invalid_count, workflow_id, created_at) VALUES (?,?,?,?,?,?,?,?)").run(
    impId,
    filename,
    JSON.stringify(mapping),
    dataRows.length,
    imported,
    dataRows.length - imported - skippedDuplicates + skippedDuplicates, // invalid = failed validation rows incl. dupes
    workflowId,
    now
  );

  return NextResponse.json({
    imported,
    skipped_duplicates: skippedDuplicates,
    invalid: dataRows.length - imported,
    verdicts,
    run_id: runId,
    workflow_id: workflowId,
  });
}
