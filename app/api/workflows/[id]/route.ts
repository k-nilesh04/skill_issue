import { NextResponse } from "next/server";
import { db, getJSON } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const w = db.prepare("SELECT * FROM workflows WHERE id=?").get(id) as any;
  if (!w) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  const runs = db.prepare("SELECT * FROM runs WHERE workflow_id=? ORDER BY started_at DESC").all(id).map((r: any) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    stage: r.stage,
    started_at: r.started_at,
    finished_at: r.finished_at,
    stats: getJSON(r, "stats_json"),
    error: r.error,
  }));
  return NextResponse.json({
    workflow: {
      id: w.id,
      title: w.title,
      original_query: w.original_query,
      language: w.language,
      entity_type: w.entity_type,
      interpretation: getJSON(w, "interpretation_json"),
      plan: getJSON(w, "plan_json"),
      created_at: w.created_at,
      updated_at: w.updated_at,
    },
    runs,
  });
}
