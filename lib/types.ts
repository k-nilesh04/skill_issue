// Shared domain types for SCOUT's pipeline.

import type { ExtractedField, Interpretation, Plan, PlanSource } from "./ai";

export type { ExtractedField, Interpretation, Plan, PlanSource };

export type FieldValue = { value: string; source_url: string; quote: string; confidence: number };

export type LogLine = { t: string; level: "info" | "warn" | "error"; source: string; msg: string };

export type { ExtractedRecord } from "./ai";
