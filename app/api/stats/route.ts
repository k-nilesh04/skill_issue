import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await ensureSeeded();
  const one = (sql: string) => (db.prepare(sql).get() as any)?.n ?? 0;
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const stats = {
    workflows: one("SELECT COUNT(*) as n FROM workflows"),
    records: one("SELECT COUNT(*) as n FROM records WHERE status='accepted' AND sample=0"),
    sample_records: one("SELECT COUNT(*) as n FROM records WHERE status='accepted' AND sample=1"),
    active_runs: one("SELECT COUNT(*) as n FROM runs WHERE status IN ('queued','running')"),
    active_schedules: one("SELECT COUNT(*) as n FROM schedules WHERE paused=0"),
    records_last_24h: one(`SELECT COUNT(*) as n FROM records WHERE status='accepted' AND created_at >= '${dayAgo}'`),
    total_runs: one("SELECT COUNT(*) as n FROM runs"),
  };
  const recentRuns = (db
    .prepare(
      `SELECT r.id, r.workflow_id, r.trigger, r.status, r.started_at, r.finished_at, r.stats_json, w.title as workflow_title, w.language
       FROM runs r JOIN workflows w ON w.id = r.workflow_id ORDER BY r.started_at DESC LIMIT 8`
    )
    .all() as any[]).map((r) => ({
    id: r.id,
    workflow_id: r.workflow_id,
    workflow_title: r.workflow_title,
    language: r.language,
    trigger: r.trigger,
    status: r.status,
    started_at: r.started_at,
    finished_at: r.finished_at,
    stats: r.stats_json ? JSON.parse(r.stats_json) : null,
  }));
  const latestWithDiff = (db
    .prepare(`SELECT workflow_id, last_diff_json FROM schedules WHERE last_diff_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`)
    .get() as any) ?? null;

  return NextResponse.json({ ...stats, recent_runs: recentRuns, recent_change: latestWithDiff ? JSON.parse(latestWithDiff.last_diff_json) : null });
}
