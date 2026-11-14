// lib/ai.ts — THE single wrapper for every model call in SCOUT (spec section 7).
//
// Live mode:  any OpenAI-compatible chat-completions endpoint.
//             Env: OPENAI_API_KEY (required), OPENAI_BASE_URL (default
//             https://api.openai.com/v1), OPENAI_MODEL (default gpt-4o-mini).
// Fallback:   when no key is configured, deterministic heuristic implementations
//             produce the SAME JSON shapes from the actual input text. Every result
//             carries `engine: "llm" | "heuristic"` so the UI labels each stage
//             honestly ("heuristic fallback — no LLM key configured"). The heuristic
//             extractor only ever returns values backed by a verbatim quote from the
//             content it was given — it never invents data.
//
// Failure handling: 1 retry on any model call, then the stage fails with a real error.

import { db, newId, nowIso } from "./db";

export type Ambiguity = { concern: string; default_applied: string };

export type Interpretation = {
  entity_type: string;
  summary: string;
  fields: string[];
  location: string | null;
  date_from: string;
  date_to: string;
  keywords: string[];
  ambiguities: Ambiguity[];
};

export type PlanSource = { adapter: string; enabled: boolean; rationale: string };

export type Plan = {
  sources: PlanSource[];
  search_queries: string[];
  devfolio_filters: { keywords: string[]; mode: string };
  steps: string[];
  validation_rules: string[];
};

export type ExtractedField = { value: string; quote: string };
export type ExtractedRecord = { fields: Record<string, ExtractedField> };

export type AiResult<T> = { data: T; engine: "llm" | "heuristic"; raw: unknown; error?: string };

// ---------------------------------------------------------------- live LLM call

export function hasLLM(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function llmConfig() {
  return {
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  };
}

async function chatJSON(system: string, user: string): Promise<unknown> {
  const { baseUrl, model } = llmConfig();
  const call = async () => {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`LLM API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty content");
    return JSON.parse(content);
  };
  try {
    return await call();
  } catch (first) {
    // one retry, then surface the real error
    try {
      return await call();
    } catch {
      throw new Error(`LLM call failed after retry: ${String((first as Error)?.message ?? first).slice(0, 300)}`);
    }
  }
}

// ---------------------------------------------------------------- prompt contracts

const INTERPRET_SYSTEM = `You are SCOUT's query interpreter for an India opportunity-intelligence platform.
Detect the language (English or Hindi) of the user query, then return ONLY a JSON object with this exact shape:
{
  "detected_language": "en" | "hi",
  "interpretation": {
    "entity_type": string,            // "event" for this version
    "summary": string,                // 1-2 sentences in the user's language
    "fields": string[],               // field keys the user asked for, from the event schema
    "location": string | null,        // normalized location, e.g. "Delhi NCR"
    "date_from": "YYYY-MM-DD",        // today unless stated
    "date_to": "YYYY-MM-DD",          // today + N days when "next N days" appears, else today+30
    "keywords": string[],
    "ambiguities": [{ "concern": string, "default_applied": string }]
  }
}
Rules: never leave date_from/date_to null — apply a documented default and record it in ambiguities.
Preserve EVERY constraint the user stated. If the query is Hindi, summary and ambiguity strings are in
Hindi but field keys stay English. Event field keys: event_name, organiser, start_date, end_date, venue,
city, mode, registration_deadline, eligibility, registration_url, tags, source_url.`;

const PLAN_SYSTEM = `You are SCOUT's collection planner. Given an interpretation and an adapter registry, return ONLY JSON:
{
  "sources": [{ "adapter": "web_search" | "devfolio", "enabled": boolean, "rationale": string }],
  "search_queries": string[],  // 3-5 specific English search strings
  "devfolio_filters": { "keywords": string[], "mode": string },
  "steps": string[],
  "validation_rules": string[]
}
Adapter registry: WEB_SEARCH = "broad web discovery via search API, always available";
DEVFOLIO = "public India hackathon listings API".
Search queries are ALWAYS English even for Hindi queries. The rationale strings must be in the user's language.
Suggested validation rules: "start_date must parse and be within filter range", "registration_url must be http(s) and taken from source content", "dedup_key: normalized name|city|start_date".`;

const EXTRACT_SYSTEM = `You are SCOUT's structured extractor. Given source content and an event field schema, return ONLY JSON:
{ "records": [{ "fields": { "<field_key>": { "value": string, "quote": string } } }] }
Rules: include a field ONLY if evidence exists in the provided content, else omit it. Dates normalized to
YYYY-MM-DD. NEVER invent URLs — registration_url/source_url only if present in the content. quote must be a
verbatim substring of the content. If the content contains zero relevant events return { "records": [] }.
Field keys: event_name, organiser, start_date, end_date, venue, city, mode, registration_deadline,
eligibility, registration_url, tags, source_url.`;

const DIFF_SYSTEM = `Write one or two sentences summarizing what changed between two collection runs,
given lists of new / changed / missing records. Reply with ONLY JSON: { "summary": string }.
Match the language of the user's original query (English or Hindi).`;

const MAPPING_SYSTEM = `Given CSV headers and an event field schema, suggest a mapping header -> field key
(or null to skip). Return ONLY JSON: { "mapping": { "<header>": "<field_key>" | null } }.
Field keys: event_name, organiser, start_date, end_date, venue, city, mode, registration_deadline,
eligibility, registration_url, tags, source_url, source_adapter.`;

// ---------------------------------------------------------------- public API

export async function interpretQuery(query: string): Promise<AiResult<Interpretation & { detected_language: string }>> {
  if (hasLLM()) {
    try {
      const raw = await chatJSON(INTERPRET_SYSTEM, query);
      const d = raw as any;
      const interp = d.interpretation ?? d;
      return {
        data: {
          detected_language: d.detected_language ?? detectLanguage(query),
          entity_type: interp.entity_type ?? "event",
          summary: interp.summary ?? "",
          fields: interp.fields ?? DEFAULT_FIELDS,
          location: interp.location ?? null,
          date_from: interp.date_from ?? isoToday(),
          date_to: interp.date_to ?? isoDaysFromToday(30),
          keywords: interp.keywords ?? [],
          ambiguities: interp.ambiguities ?? [],
        },
        engine: "llm",
        raw,
      };
    } catch (e) {
      const fb = heuristicInterpret(query);
      return { data: fb, engine: "heuristic", raw: { error: String((e as Error).message), fallback: fb }, error: String((e as Error).message) };
    }
  }
  const fb = heuristicInterpret(query);
  return { data: fb, engine: "heuristic", raw: { note: "heuristic fallback — no OPENAI_API_KEY configured", output: fb } };
}

export async function generatePlan(
  interpretation: Interpretation,
  enabledAdapters: string[],
  language: string
): Promise<AiResult<Plan>> {
  if (hasLLM()) {
    try {
      const registry =
        "WEB_SEARCH: broad web discovery via search API, always available. DEVFOLIO: public India hackathon listings API.";
      const raw = await chatJSON(
        PLAN_SYSTEM,
        `User language: ${language}\nEnabled adapters: ${enabledAdapters.join(", ")}\nAdapter registry:\n${registry}\nInterpretation:\n${JSON.stringify(interpretation)}`
      );
      const p = raw as any;
      return {
        data: {
          sources: (p.sources ?? []).filter((s: any) => typeof s.adapter === "string"),
          search_queries: p.search_queries ?? [],
          devfolio_filters: p.devfolio_filters ?? { keywords: ["AI", "hackathon"], mode: "offline" },
          steps: p.steps ?? DEFAULT_STEPS,
          validation_rules: p.validation_rules ?? DEFAULT_RULES,
        },
        engine: "llm",
        raw,
      };
    } catch (e) {
      const fb = heuristicPlan(interpretation, enabledAdapters, language);
      return { data: fb, engine: "heuristic", raw: { error: String((e as Error).message), fallback: fb }, error: String((e as Error).message) };
    }
  }
  const fb = heuristicPlan(interpretation, enabledAdapters, language);
  return { data: fb, engine: "heuristic", raw: { note: "heuristic fallback — no OPENAI_API_KEY configured", output: fb } };
}

export async function extractRecords(
  contents: { title: string; url: string; content: string }[],
  entityType: string
): Promise<AiResult<{ records: ExtractedRecord[] }>> {
  const perResult: { url: string; records: ExtractedRecord[] }[] = [];
  if (hasLLM()) {
    // batch short contents into one call to cap total calls (~10-15 per run)
    const batches: (typeof contents)[] = [];
    let batch: typeof contents = [];
    for (const c of contents) {
      batch.push(c);
      if (batch.reduce((n, x) => n + x.content.length, 0) > 3500 || batch.length >= 4) {
        batches.push(batch);
        batch = [];
      }
    }
    if (batch.length) batches.push(batch);
    let anyError: string | undefined;
    for (const b of batches) {
      const user = `Field schema: ${entityType}\n\n${b
        .map((c, i) => `--- SOURCE ${i + 1} (url: ${c.url}) ---\ntitle: ${c.title}\ncontent: ${c.content}`)
        .join("\n\n")}`;
      try {
        const raw = await chatJSON(EXTRACT_SYSTEM, user);
        const d = raw as any;
        const recs: ExtractedRecord[] = d.records ?? [];
        perResult.push({ url: `batch:${b.map((x) => x.url).join(",")}`, records: recs });
      } catch (e) {
        anyError = String((e as Error).message);
      }
      await sleep(400 + Math.floor(Math.random() * 400)); // rate-limit between extraction calls
    }
    return { data: { records: perResult.flatMap((r) => r.records) }, engine: "llm", raw: { batches: perResult, error: anyError }, error: anyError };
  }
  // heuristic fallback: real rule-based extraction per source result
  for (const c of contents) {
    perResult.push({ url: c.url, records: heuristicExtract(c) });
  }
  const recs = perResult.flatMap((r) => r.records);
  return {
    data: { records: recs },
    engine: "heuristic",
    raw: { note: "heuristic fallback — no OPENAI_API_KEY configured", per_source: perResult.map((r) => ({ url: r.url, count: r.records.length })) },
  };
}

export async function diffSummary(
  buckets: { newCount: number; changedCount: number; missingCount: number; unchangedCount: number },
  language: string,
  changedFieldDetail?: string
): Promise<AiResult<{ summary: string }>> {
  if (hasLLM()) {
    try {
      const raw = await chatJSON(
        DIFF_SYSTEM,
        `User query language: ${language}. New: ${buckets.newCount}, changed: ${buckets.changedCount}, missing: ${buckets.missingCount}, unchanged: ${buckets.unchangedCount}. ${changedFieldDetail ?? ""}`
      );
      const s = (raw as any)?.summary;
      if (typeof s === "string" && s) return { data: { summary: s }, engine: "llm", raw };
    } catch {
      /* fall through to template */
    }
  }
  const summary = templateDiffSummary(buckets, language, changedFieldDetail);
  return { data: { summary }, engine: "heuristic", raw: { note: "template fallback", summary } };
}

export async function suggestMapping(headers: string[], entityType: string): Promise<AiResult<{ mapping: Record<string, string | null> }>> {
  if (hasLLM()) {
    try {
      const raw = await chatJSON(MAPPING_SYSTEM, `Headers: ${JSON.stringify(headers)}\nEntity: ${entityType}`);
      const m = (raw as any)?.mapping;
      if (m && typeof m === "object") return { data: { mapping: m }, engine: "llm", raw };
    } catch {
      /* fall through */
    }
  }
  const mapping = heuristicMapping(headers);
  return { data: { mapping }, engine: "heuristic", raw: { note: "heuristic fallback", mapping } };
}

// ---------------------------------------------------------------- ai output audit trail

export function saveAiOutput(runId: string | null, stage: string, label: string, raw: unknown): string {
  const id = newId();
  db.prepare("INSERT INTO ai_outputs (id, run_id, stage, label, raw_json, created_at) VALUES (?,?,?,?,?,?)").run(
    id,
    runId,
    stage,
    label,
    JSON.stringify(raw),
    nowIso()
  );
  return id;
}

export function getAiOutputs(runId: string) {
  return db
    .prepare("SELECT id, stage, label, raw_json, created_at FROM ai_outputs WHERE run_id = ? ORDER BY created_at")
    .all(runId)
    .map((r: any) => ({ id: r.id, stage: r.stage, label: r.label, raw: JSON.parse(r.raw_json), created_at: r.created_at }));
}

// ---------------------------------------------------------------- heuristics (fallback engine)

import { DEFAULT_FIELDS, DEFAULT_STEPS, DEFAULT_RULES } from "./plan-defaults";
import { heuristicExtract, heuristicInterpret, heuristicPlan, heuristicMapping, templateDiffSummary } from "./heuristic";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function detectLanguage(q: string): "en" | "hi" {
  return /[\u0900-\u097F]/.test(q) ? "hi" : "en";
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
