import { NextResponse } from "next/server";
import { generatePlan, saveAiOutput } from "@/lib/ai";
import type { Interpretation } from "@/lib/types";
import { ensureSeeded } from "@/lib/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await ensureSeeded();
  const body = await req.json();
  const interpretation = body?.interpretation as Interpretation;
  const enabledAdapters: string[] = Array.isArray(body?.enabledAdapters) ? body.enabledAdapters : ["web_search"];
  const language: string = body?.language === "hi" ? "hi" : "en";
  if (!interpretation || !interpretation.entity_type) {
    return NextResponse.json({ error: "interpretation object required" }, { status: 400 });
  }
  const result = await generatePlan(interpretation, enabledAdapters, language);
  const id = saveAiOutput(null, "plan", `Stage handled by ${result.engine === "llm" ? "platform model" : "heuristic fallback"}: planning`, result.raw);
  return NextResponse.json({ id, engine: result.engine, error: result.error ?? null, raw: result.raw, plan: result.data });
}
