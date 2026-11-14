import { NextResponse } from "next/server";
import { db, newId, nowIso, getJSON } from "@/lib/db";
import { nextRunFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Honest tick model (spec section 10): processes due schedules sequentially through the
// normal pipeline. The client calls this on app load and every 60s while open.
export async function POST() {
  const due = db
    .prepare("SELECT * FROM schedules WHERE paused = 0 AND next_run_at <= ?")
    .all(nowIso()) as any[];
  const executed: { schedule_id: string; workflow_id: string; run_id: string; status: string; diff: unknown }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { executeRun } = require("@/lib/pipeline") as typeof import("@/lib/pipeline");

  for (const s of due) {
    const prevRun = db
      .prepare("SELECT id FROM runs WHERE workflow_id=? AND status IN ('completed','partial') ORDER BY started_at DESC LIMIT 1")
      .get(s.workflow_id) as any;
    const runId = newId();
    db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json, previous_run_id) VALUES (?,?,?,?,?,?,?,?)").run(
      runId,
      s.workflow_id,
      "scheduled",
      "queued",
      "queued",
      nowIso(),
      "[]",
      prevRun?.id ?? null
    );
    await executeRun(runId);
    const run = db.prepare("SELECT * FROM runs WHERE id=?").get(runId) as any;
    const stats = getJSON<{ diff?: unknown }>(run, "stats_json") ?? {};
    db.prepare("UPDATE schedules SET last_run_id=?, last_diff_json=?, next_run_at=? WHERE id=?").run(
      runId,
      JSON.stringify(stats.diff ?? null),
      nextRunFor(s.frequency),
      s.id
    );
    executed.push({ schedule_id: s.id, workflow_id: s.workflow_id, run_id: runId, status: run.status, diff: stats.diff ?? null });
  }

  return NextResponse.json({ executed_count: executed.length, executed });
}
