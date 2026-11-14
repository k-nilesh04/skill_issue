import { NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { executeRun } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Re-executes only the failed sources of the original run, as a new linked run.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orig = db.prepare("SELECT * FROM runs WHERE id=?").get(id) as any;
  if (!orig) return NextResponse.json({ error: "run not found" }, { status: 404 });
  if (orig.status !== "partial" && orig.status !== "failed") {
    return NextResponse.json({ error: "retry is only available for partial/failed runs" }, { status: 400 });
  }

  const failedSources = db
    .prepare("SELECT DISTINCT adapter FROM run_sources WHERE run_id=? AND status='error'")
    .all(id)
    .map((s: any) => s.adapter);
  if (!failedSources.length) {
    return NextResponse.json({ error: "no errored sources to retry" }, { status: 400 });
  }

  const runId = newId();
  db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json, previous_run_id, retried_source) VALUES (?,?,?,?,?,?,?,?,?)").run(
    runId,
    orig.workflow_id,
    "run_now",
    "queued",
    "queued",
    nowIso(),
    "[]",
    orig.previous_run_id,
    JSON.stringify(failedSources)
  );

  await executeRun(runId, { onlySources: failedSources });

  const run = db.prepare("SELECT * FROM runs WHERE id=?").get(runId) as any;
  return NextResponse.json({ run_id: runId, status: run.status, retried_sources: failedSources, error: run.error });
}
