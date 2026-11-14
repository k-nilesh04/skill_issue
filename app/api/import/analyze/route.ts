import { NextResponse } from "next/server";
import { parseCSV } from "@/lib/csv";
import { suggestMapping, saveAiOutput } from "@/lib/ai";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/import/analyze — multipart CSV → {headers, suggestedMapping, previewRows, error?}
export async function POST(req: Request) {
  await ensureSeeded();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required (multipart field 'file')" }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "CSV too large — 2MB limit" }, { status: 400 });
  if (!/\.csv$/i.test(file.name)) return NextResponse.json({ error: "only .csv files are accepted" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);
  if (rows.length === 0) return NextResponse.json({ error: "file is empty" }, { status: 400 });
  const headers = rows[0].map((h, i) => (h.trim() === "" ? `column_${i + 1}` : h.trim()));
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) {
    return NextResponse.json({ error: "duplicate column names in header row" }, { status: 400 });
  }
  const previewRows = rows.slice(1, 11); // first 10 data rows
  if (rows.length === 1) {
    return NextResponse.json({ error: "no data rows found (header only)" }, { status: 400 });
  }

  const mappingResult = await suggestMapping(headers, "event");
  const mappingId = saveAiOutput(null, "import_mapping", `Stage handled by ${mappingResult.engine === "llm" ? "platform model" : "heuristic fallback"}: column mapping suggestion`, mappingResult.raw);

  return NextResponse.json({
    filename: file.name,
    headers,
    suggestedMapping: mappingResult.data.mapping,
    mappingEngine: mappingResult.engine,
    mapping_ai_output_id: mappingId,
    previewRows,
    rowCount: rows.length - 1,
  });
}
