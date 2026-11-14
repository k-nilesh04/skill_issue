import { NextResponse } from "next/server";
import { db, newId, nowIso, getJSON } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const { query, language, interpretation, plan } = await req.json();
  if (!query || !interpretation || !plan) {
    return NextResponse.json({ error: "query, interpretation and plan are required" }, { status: 400 });
  }
  const id = newId();
  const now = nowIso();
  db.prepare(
    "INSERT INTO workflows (id, title, original_query, language, interpretation_json, plan_json, entity_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(
    id,
    String(query).slice(0, 60),
    String(query),
    language === "hi" ? "hi" : "en",
    JSON.stringify(interpretation),
    JSON.stringify(plan),
    interpretation.entity_type ?? "event",
    now,
    now
  );
  return NextResponse.json({ id });
}

export async function GET() {
  await ensureSeeded();
  const rows = db.prepare("SELECT * FROM workflows ORDER BY updated_at DESC").all() as any[];
  return NextResponse.json({
    workflows: rows.map((w) => ({
      id: w.id,
      title: w.title,
      original_query: w.original_query,
      language: w.language,
      entity_type: w.entity_type,
      created_at: w.created_at,
      updated_at: w.updated_at,
      interpretation: getJSON(w, "interpretation_json"),
      run_count: (db.prepare("SELECT COUNT(*) as n FROM runs WHERE workflow_id=?").get(w.id) as any).n,
      record_count: (db.prepare("SELECT COUNT(*) as n FROM records WHERE workflow_id=? AND status='accepted'").get(w.id) as any).n,
      last_run_at: (db.prepare("SELECT started_at FROM runs WHERE workflow_id=? ORDER BY started_at DESC LIMIT 1").get(w.id) as any)?.started_at ?? null,
    })),
  });
}
