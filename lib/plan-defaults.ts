// Shared defaults used when the model (or heuristic fallback) omits optional plan pieces.

export const DEFAULT_FIELDS = [
  "event_name",
  "organiser",
  "start_date",
  "end_date",
  "venue",
  "city",
  "mode",
  "registration_deadline",
  "eligibility",
  "registration_url",
  "tags",
  "source_url",
];

export const DEFAULT_STEPS = [
  "search sources",
  "extract structured records",
  "validate and deduplicate",
  "compare with previous run",
];

export const DEFAULT_RULES = [
  "start_date must parse and be within filter range",
  "registration_url must be http(s) and taken from source content",
  "dedup_key: normalized name|city|start_date",
];
