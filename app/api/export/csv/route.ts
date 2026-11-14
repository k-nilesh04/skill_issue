import { db } from "@/lib/db";
import { toCSV } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export/csv?workflowId&q&source&minCompleteness&verifiedOnly&from&to
// Streams CSV; UTF-8 with BOM so Excel renders Hindi correctly.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const workflowId = url.searchParams.get("workflowId");
  if (!workflowId) return new Response("workflowId required", { status: 400 });

  const wf = db.prepare("SELECT title FROM workflows WHERE id=?").get(workflowId) as any;
  if (!wf) return new Response("workflow not found", { status: 404 });

  // same filters as /api/records
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const source = url.searchParams.get("source") ?? "";
  const minCompleteness = parseFloat(url.searchParams.get("minCompleteness") ?? "0") || 0;
  const verifiedOnly = url.searchParams.get("verifiedOnly") === "1";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  const where: string[] = ["workflow_id = ?", "status = 'accepted'"];
  const args: unknown[] = [workflowId];
  if (source) {
    where.push("source_adapter = ?");
    args.push(source);
  }
  if (minCompleteness > 0) {
    where.push("completeness >= ?");
    args.push(minCompleteness);
  }
  if (verifiedOnly) where.push("verification = 'verified'");
  if (from) {
    where.push("json_extract(fields_snapshot_json, '$.start_date') >= ?");
    args.push(from);
  }
  if (to) {
    where.push("json_extract(fields_snapshot_json, '$.start_date') <= ?");
    args.push(to);
  }
  if (q) {
    where.push("LOWER(fields_snapshot_json) LIKE ?");
    args.push(`%${q}%`);
  }

  const rows = db.prepare(`SELECT * FROM records WHERE ${where.join(" AND ")} ORDER BY created_at DESC`).all(...(args as any[])) as any[];

  const headers = [
    "event_name", "organiser", "start_date", "end_date", "venue", "city", "mode",
    "registration_deadline", "eligibility", "registration_url", "tags", "source_url",
    "source_adapter", "completeness", "confidence", "verification", "sample",
  ];
  const lines = rows.map((r) => {
    const f = r.fields_snapshot_json ? JSON.parse(r.fields_snapshot_json) : {};
    return [
      f.event_name ?? "", f.organiser ?? "", f.start_date ?? "", f.end_date ?? "", f.venue ?? "", f.city ?? "", f.mode ?? "",
      f.registration_deadline ?? "", f.eligibility ?? "", f.registration_url ?? "", f.tags ?? "", f.source_url ?? "",
      r.source_adapter, String(Math.round((r.completeness ?? 0) * 100)) + "%", String((r.confidence ?? 0).toFixed(2)),
      r.verification, r.sample === 1 ? "SAMPLE" : "LIVE",
    ];
  });

  const csv = "\uFEFF" + toCSV(headers, lines);
  const date = new Date().toISOString().slice(0, 10);
  const safeName = wf.title.replace(/[^a-z0-9]+/gi, "_").slice(0, 40).toLowerCase() || "workflow";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="scout_${safeName}_${date}.csv"`,
    },
  });
}
