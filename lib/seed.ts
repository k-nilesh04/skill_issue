// First-load seeding: create one labelled SAMPLE workflow + one completed run through
// the REAL pipeline (same executeRun path, running against the SAMPLE corpus), so the
// dashboard is never empty. Everything it produces is tagged sample=1 / SAMPLE badge.

import { db, newId, nowIso } from "./db";
import { executeRun } from "./pipeline";
import { heuristicInterpret, heuristicPlan } from "./heuristic";
import type { Interpretation } from "./types";

export const SAMPLE_QUERY_EN =
  "Find upcoming AI and developer meetups, hackathons and technology conferences in Delhi NCR over the next 30 days. Include event name, organiser, date, venue, registration deadline, eligibility, registration link and source.";

export async function ensureSeeded(): Promise<void> {
  const row = db.prepare("SELECT COUNT(*) as n FROM workflows").get() as any;
  if (row.n > 0) return;

  const id = newId();
  const now = nowIso();
  const interp = heuristicInterpret(SAMPLE_QUERY_EN);
  const { detected_language, ...interpretation } = interp as Interpretation & { detected_language: string };
  const plan = heuristicPlan(interpretation, ["web_search", "devfolio"], detected_language);
  const title = SAMPLE_QUERY_EN.slice(0, 60);

  db.prepare(
    "INSERT INTO workflows (id, title, original_query, language, interpretation_json, plan_json, entity_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(id, title, SAMPLE_QUERY_EN, detected_language, JSON.stringify(interpretation), JSON.stringify(plan), "event", now, now);

  const runId = newId();
  db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json) VALUES (?,?,?,?,?,?,?)").run(
    runId,
    id,
    "manual",
    "queued",
    "queued",
    now,
    "[]"
  );
  // Run the real pipeline synchronously against the SAMPLE corpus (deterministic heuristic
  // engine — fast, and every log line/stage transition is genuinely produced by it).
  await executeRun(runId);
}

// Schedules helper shared by tick + run-now + next-run computation
export function nextRunFor(frequency: string, from = new Date()): string {
  const d = new Date(from);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else d.setDate(d.getDate() + 1);
  return d.toISOString();
}
