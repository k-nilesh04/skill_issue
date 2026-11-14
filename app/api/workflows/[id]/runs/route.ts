import { NextResponse } from "next/server";
import { db, newId, nowIso, getJSON } from "@/lib/db";
import { executeRun } from "@/lib/pipeline";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Creates a Run row (queued) and executes the pipeline in the SAME request handler,
// writing stage transitions / logs / records as each step completes so parallel
// polling GETs see real progress.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureSeeded();
  const { id } = await params;
  const wf = db.prepare("SELECT * FROM workflows WHERE id=?").get(id) as any;
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const trigger = body?.trigger === "scheduled" ? "scheduled" : body?.trigger === "run_now" ? "run_now" : "manual";

  const prevRun = db
    .prepare("SELECT id FROM runs WHERE workflow_id=? AND status IN ('completed','partial') ORDER BY started_at DESC LIMIT 1")
    .get(id) as any;

  const runId = newId();
  db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json, previous_run_id) VALUES (?,?,?,?,?,?,?,?)").run(
    runId,
    id,
    trigger,
    "queued",
    "queued",
    nowIso(),
    "[]",
    prevRun?.id ?? null
  );

  await executeRun(runId, body?.onlySources ? { onlySources: body.onlySources } : undefined);

  const run = db.prepare("SELECT * FROM runs WHERE id=?").get(runId) as any;
  return NextResponse.json({
    run_id: runId,
    status: run.status,
    stage: run.stage,
    stats: getJSON(run, "stats_json"),
    error: run.error,
  });
}
