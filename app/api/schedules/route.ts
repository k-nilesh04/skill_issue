import { NextResponse } from "next/server";
import { db, newId, nowIso } from "@/lib/db";
import { nextRunFor } from "@/lib/seed";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const { workflowId, frequency } = await req.json();
  if (!workflowId || !["daily", "weekly"].includes(frequency)) {
    return NextResponse.json({ error: "workflowId and frequency (daily|weekly) required" }, { status: 400 });
  }
  const wf = db.prepare("SELECT id FROM workflows WHERE id=?").get(workflowId);
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  const id = newId();
  db.prepare("INSERT INTO schedules (id, workflow_id, frequency, next_run_at, paused, created_at) VALUES (?,?,?,?,0,?)").run(
    id,
    workflowId,
    frequency,
    nextRunFor(frequency),
    nowIso()
  );
  return NextResponse.json({ id });
}

export async function GET() {
  await ensureSeeded();
  const rows = db
    .prepare(
      `SELECT s.*, w.title as workflow_title, w.language as workflow_language FROM schedules s JOIN workflows w ON w.id = s.workflow_id ORDER BY s.next_run_at`
    )
    .all() as any[];
  return NextResponse.json({
    schedules: rows.map((s) => ({
      id: s.id,
      workflow_id: s.workflow_id,
      workflow_title: s.workflow_title,
      frequency: s.frequency,
      next_run_at: s.next_run_at,
      paused: s.paused === 1,
      last_run_id: s.last_run_id,
      last_diff: s.last_diff_json ? JSON.parse(s.last_diff_json) : null,
      created_at: s.created_at,
    })),
  });
}
