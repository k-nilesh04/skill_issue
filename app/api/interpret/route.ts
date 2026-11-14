import { NextResponse } from "next/server";
import { interpretQuery, saveAiOutput } from "@/lib/ai";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const { query } = await req.json();
  if (!query || typeof query !== "string" || query.trim().length < 8) {
    return NextResponse.json({ error: "query must be a non-empty string (min 8 chars)" }, { status: 400 });
  }
  const result = await interpretQuery(query.trim());
  const id = saveAiOutput(null, "interpret", `Stage handled by ${result.engine === "llm" ? "platform model" : "heuristic fallback"}: interpretation`, result.raw);
  return NextResponse.json({
    id,
    engine: result.engine,
    error: result.error ?? null,
    raw: result.raw,
    detected_language: result.data.detected_language,
    interpretation: result.data,
  });
}
