// Run-to-run diff: buckets accepted records of two runs and computes field-level deltas.

export type FieldDelta = { field: string; before: string; after: string };
export type DiffRecord = { identity_key: string; name: string; fieldDeltas?: FieldDelta[]; recordId?: string };
export type DiffBuckets = { new: DiffRecord[]; changed: DiffRecord[]; missing: DiffRecord[]; unchanged: DiffRecord[] };

type Rec = {
  id: string;
  identity_key: string;
  fields_snapshot_json: string;
  data_json: string;
  change_state: string | null;
};

export function computeDiff(prevRunId: string, currRunId: string): DiffBuckets {
  const prev = keyed(allAccepted(prevRunId));
  const curr = keyed(allAccepted(currRunId));

  const buckets: DiffBuckets = { new: [], changed: [], missing: [], unchanged: [] };
  for (const [key, rec] of curr) {
    const before = prev.get(key);
    const name = nameOf(rec);
    if (!before) {
      buckets.new.push({ identity_key: key, name, recordId: rec.id });
      continue;
    }
    const deltas = fieldDeltas(before, rec);
    if (deltas.length) buckets.changed.push({ identity_key: key, name, fieldDeltas: deltas, recordId: rec.id });
    else buckets.unchanged.push({ identity_key: key, name, recordId: rec.id });
  }
  for (const [key, rec] of prev) {
    if (!curr.has(key)) buckets.missing.push({ identity_key: key, name: nameOf(rec), recordId: rec.id });
  }
  return buckets;
}

function allAccepted(runId: string): Rec[] {
  // lazy import avoided: caller passes db-less via require to prevent cycles
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db } = require("./db") as typeof import("./db");
  return db
    .prepare("SELECT id, identity_key, fields_snapshot_json, data_json, change_state FROM records WHERE run_id = ? AND status = 'accepted'")
    .all(runId) as unknown as Rec[];
}

function keyed(recs: Rec[]): Map<string, Rec> {
  const m = new Map<string, Rec>();
  for (const r of recs) m.set(r.identity_key, r);
  return m;
}

function nameOf(rec: Rec): string {
  try {
    const data = JSON.parse(rec.data_json);
    return data?.event_name?.value ?? data?.event_name ?? "(unnamed)";
  } catch {
    return "(unnamed)";
  }
}

function fieldDeltas(a: Rec, b: Rec): FieldDelta[] {
  const before = safeFlat(a);
  const after = safeFlat(b);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: FieldDelta[] = [];
  for (const k of keys) {
    const bv = (before[k] ?? "").toString();
    const av = (after[k] ?? "").toString();
    if (bv !== av) out.push({ field: k, before: bv, after: av });
  }
  return out;
}

function safeFlat(rec: Rec): Record<string, unknown> {
  try {
    return JSON.parse(rec.fields_snapshot_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
