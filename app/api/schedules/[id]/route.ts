import { NextResponse } from "next/server";
import { db, newId, nowIso, getJSON } from "@/lib/db";
import { nextRunFor } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// PATCH — pause/resume/edit frequency
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = db.prepare("SELECT * FROM schedules WHERE id=?").get(id) as any;
  if (!s) return NextResponse.json({ error: "schedule not found" }, { status: 404 });
  const body = await req.json();
  const paused = typeof body.paused === "boolean" ? (body.paused ? 1 : 0) : s.paused;
  const frequency = ["daily", "weekly"].includes(body.frequency) ? body.frequency : s.frequency;
  let next_run_at = s.next_run_at;
  if (typeof body.paused === "boolean" && body.paused === false && s.paused === 1) {
    next_run_at = nextRunFor(frequency); // resuming reschedules from now
  } else if (frequency !== s.frequency) {
    next_run_at = nextRunFor(frequency);
  }
  db.prepare("UPDATE schedules SET paused=?, frequency=?, next_run_at=? WHERE id=?").run(paused, frequency, next_run_at, id);
  return NextResponse.json({ id, paused: paused === 1, frequency, next_run_at });
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = db.prepare("DELETE FROM schedules WHERE id=?").run(id);
  if (res.changes === 0) return NextResponse.json({ error: "schedule not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// POST — Run Now: executes immediately through the normal pipeline (bypasses next_run_at),
// stores last_run_id and the diff badge.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = db.prepare("SELECT * FROM schedules WHERE id=?").get(id) as any;
  if (!s) return NextResponse.json({ error: "schedule not found" }, { status: 404 });

  const prevRun = db
    .prepare("SELECT id FROM runs WHERE workflow_id=? AND status IN ('completed','partial') ORDER BY started_at DESC LIMIT 1")
    .get(s.workflow_id) as any;

  const runId = newId();
  db.prepare("INSERT INTO runs (id, workflow_id, trigger, status, stage, started_at, logs_json, previous_run_id) VALUES (?,?,?,?,?,?,?,?)").run(
    runId,
    s.workflow_id,
    "run_now",
    "queued",
    "queued",
    nowIso(),
    "[]",
    prevRun?.id ?? null
  );

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { executeRun } = require("@/lib/pipeline") as typeof import("@/lib/pipeline");
  await executeRun(runId);

  const run = db.prepare("SELECT * FROM runs WHERE id=?").get(runId) as any;
  const stats = getJSON<{ diff?: { new: number; changed: number; missing: number; unchanged: number } }>(run, "stats_json") ?? {};
  db.prepare("UPDATE schedules SET last_run_id=?, last_diff_json=?, next_run_at=? WHERE id=?").run(
    runId,
    JSON.stringify(stats.diff ?? null),
    s.next_run_at,
    id
  );
  return NextResponse.json({ run_id: runId, status: run.status, diff: stats.diff ?? null });
}
