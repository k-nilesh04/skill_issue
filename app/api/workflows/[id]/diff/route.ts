import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeDiff } from "@/lib/diff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/workflows/:id/diff?runA&runB  (runA = earlier, runB = later; defaults to latest two)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  let runA = url.searchParams.get("runA") ?? "";
  let runB = url.searchParams.get("runB") ?? "";

  const runs = db
    .prepare("SELECT id, started_at, trigger, status, stats_json FROM runs WHERE workflow_id=? AND status IN ('completed','partial') ORDER BY started_at DESC")
    .all(id) as any[];
  if (runs.length < 1) return NextResponse.json({ error: "workflow has no completed runs to compare" }, { status: 404 });

  if (!runA || !runB) {
    const valid = runs.slice(0, 2);
    runB = runB || valid[0]?.id;
    runA = runA || (valid[1]?.id ?? valid[0]?.id);
  }
  const a = runs.find((r) => r.id === runA);
  const b = runs.find((r) => r.id === runB);
  if (!a || !b) return NextResponse.json({ error: "runA/runB not found for this workflow" }, { status: 404 });

  const buckets = runA === runB ? { new: [], changed: [], missing: [], unchanged: [] } : computeDiff(runA, runB);
  const changedDetail = buckets.changed
    .slice(0, 5)
    .flatMap((c) => (c.fieldDeltas ?? []).map((d) => d.field))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 3)
    .join(", ");

  return NextResponse.json({
    runA: { id: a.id, started_at: a.started_at, trigger: a.trigger },
    runB: { id: b.id, started_at: b.started_at, trigger: b.trigger },
    runs: runs.map((r) => ({ id: r.id, started_at: r.started_at, trigger: r.trigger, status: r.status, stats: r.stats_json ? JSON.parse(r.stats_json) : null })),
    buckets,
    changed_fields: changedDetail,
  });
}
