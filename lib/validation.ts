// Validation + dedup rule engine (spec section 11). Rules are code, not model-guessed.

import type { FieldValue, LogLine } from "./types";
import { schemaFor } from "./fields";
import { createHash } from "node:crypto";

export type CandidateRecord = {
  fields: Record<string, FieldValue>;
  sourceAdapter: string;
  sourceUrl: string | null;
  sample: boolean;
};

export type Verdict =
  | { outcome: "accepted"; record: CandidateRecord; completeness: number; confidence: number; verification: string }
  | { outcome: "rejected"; reason: string; record: CandidateRecord };

export function identityKey(fields: Record<string, FieldValue>): string {
  const name = (fields.event_name?.value ?? "").toLowerCase().trim();
  const city = (fields.city?.value ?? "unknown").toLowerCase().trim();
  const date = (fields.start_date?.value ?? "unknown").toLowerCase().trim();
  return createHash("sha1").update(`${name}|${city}|${date}`).digest("hex");
}

export function validateRecord(
  rec: CandidateRecord,
  filters: { date_from?: string; date_to?: string },
  urlAllowlist: Set<string>,
  entityType: string,
  log: LogLine["source"]
): Verdict {
  const required = schemaFor(entityType).filter((f) => f.required).map((f) => f.key);
  for (const key of required) {
    const v = rec.fields[key]?.value;
    if (!v || !v.trim()) {
      return { outcome: "rejected", reason: `required field missing: ${key}`, record: rec };
    }
  }

  const startRaw = rec.fields.start_date?.value ?? "";
  const startDate = new Date(`${startRaw}T00:00:00Z`);
  if (!startRaw || isNaN(startDate.getTime())) {
    return { outcome: "rejected", reason: `invalid start_date "${startRaw}"`, record: rec };
  }
  if (filters.date_from && startRaw < filters.date_from) {
    return { outcome: "rejected", reason: `start_date ${startRaw} before filter date_from ${filters.date_from}`, record: rec };
  }
  if (filters.date_to && startRaw > filters.date_to) {
    return { outcome: "rejected", reason: `start_date ${startRaw} after filter date_to ${filters.date_to}`, record: rec };
  }
  const deadline = rec.fields.registration_deadline?.value;
  if (deadline && isNaN(new Date(`${deadline}T00:00:00Z`).getTime())) {
    return { outcome: "rejected", reason: `invalid registration_deadline "${deadline}"`, record: rec };
  }

  for (const key of ["registration_url", "source_url"] as const) {
    const url = rec.fields[key]?.value;
    if (url) {
      if (!/^https?:\/\//i.test(url)) {
        return { outcome: "rejected", reason: `${key} is not http(s)`, record: rec };
      }
      if (!urlAllowlist.has(url)) {
        return { outcome: "rejected", reason: `${key} not present in source results (url allowlist)`, record: rec };
      }
    }
  }

  // completeness + confidence + verification
  const schema = schemaFor(entityType);
  const requiredKeys = schema.filter((f) => f.required).map((f) => f.key);
  const filled = requiredKeys.filter((k) => rec.fields[k]?.value?.trim()).length;
  const completeness = requiredKeys.length ? filled / requiredKeys.length : 0;

  const fieldConfs = Object.values(rec.fields).map((f) => f.confidence ?? 0.6);
  const confidence = fieldConfs.length ? fieldConfs.reduce((a, b) => a + b, 0) / fieldConfs.length : 0;

  const missingRequired = requiredKeys.filter((k) => !rec.fields[k]?.value?.trim());
  const unquoted = Object.entries(rec.fields).filter(([, v]) => !v.quote).length;
  const verification = missingRequired.length ? "missing_fields" : unquoted ? "unverified" : "verified";

  return { outcome: "accepted", record: rec, completeness, confidence, verification };
}
