import { NextResponse } from "next/server";
import { db, getJSON } from "@/lib/db";
import { getAiOutputs } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = db.prepare("SELECT * FROM runs WHERE id=?").get(id) as any;
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });
  const sources = db
    .prepare("SELECT * FROM run_sources WHERE run_id=? ORDER BY started_at")
    .all(id)
    .map((s: any) => ({
      id: s.id,
      adapter: s.adapter,
      status: s.status,
      queries_used: getJSON(s, "queries_used_json") ?? [],
      found: s.found,
      processed: s.processed,
      accepted: s.accepted,
      rejected: s.rejected,
      error: s.error,
      started_at: s.started_at,
      finished_at: s.finished_at,
    }));
  const logs = run.logs_json ? JSON.parse(run.logs_json) : [];
  return NextResponse.json({
    run: {
      id: run.id,
      workflow_id: run.workflow_id,
      trigger: run.trigger,
      status: run.status,
      stage: run.stage,
      started_at: run.started_at,
      finished_at: run.finished_at,
      stats: getJSON(run, "stats_json"),
      error: run.error,
      previous_run_id: run.previous_run_id,
    },
    sources,
    logs,
    ai_outputs: getAiOutputs(id),
  });
}
