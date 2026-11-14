import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/records?workflowId&q&source&minCompleteness&verifiedOnly&from&to&sort&dir&includeRejected&sample
export async function GET(req: Request) {
  await ensureSeeded();
  const url = new URL(req.url);
  const workflowId = url.searchParams.get("workflowId");
  if (!workflowId) return NextResponse.json({ error: "workflowId required" }, { status: 400 });

  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const source = url.searchParams.get("source") ?? "";
  const minCompleteness = parseFloat(url.searchParams.get("minCompleteness") ?? "0") || 0;
  const verifiedOnly = url.searchParams.get("verifiedOnly") === "1";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const includeRejected = url.searchParams.get("includeRejected") === "1";
  const sample = url.searchParams.get("sample") === "1";
  const sort = url.searchParams.get("sort") ?? "created_at";
  const dir = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";

  const sortCols: Record<string, string> = {
    created_at: "created_at",
    completeness: "completeness",
    confidence: "confidence",
    event_name: "json_extract(fields_snapshot_json, '$.event_name')",
    start_date: "json_extract(fields_snapshot_json, '$.start_date')",
    city: "json_extract(fields_snapshot_json, '$.city')",
  };
  const sortCol = sortCols[sort] ?? sortCols.created_at;

  const where: string[] = ["workflow_id = ?", "sample = ?"];
  const args: unknown[] = [workflowId, sample ? 1 : 0];
  if (!includeRejected) where.push("status = 'accepted'");
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

  const rows = db
    .prepare(`SELECT * FROM records WHERE ${where.join(" AND ")} ORDER BY ${sortCol} ${dir} NULLS LAST, created_at DESC`)
    .all(...(args as any[])) as any[];

  return NextResponse.json({
    records: rows.map(mapRecord),
    total: rows.length,
  });
}

export function mapRecord(r: any) {
  return {
    id: r.id,
    run_id: r.run_id,
    identity_key: r.identity_key,
    data: r.data_json ? JSON.parse(r.data_json) : {},
    fields: r.fields_snapshot_json ? JSON.parse(r.fields_snapshot_json) : {},
    source_adapter: r.source_adapter,
    source_url: r.source_url,
    completeness: r.completeness,
    confidence: r.confidence,
    verification: r.verification,
    status: r.status,
    rejection_reason: r.rejection_reason,
    sample: r.sample === 1,
    first_seen_run_id: r.first_seen_run_id,
    last_seen_run_id: r.last_seen_run_id,
    change_state: r.change_state,
    created_at: r.created_at,
  };
}
