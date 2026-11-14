// Event field schema — fixed for v1 (spec section 6).
// Design note: adding a new entity type later = adding another FIELD_SCHEMAS entry.

export type FieldDef = {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "date" | "url" | "tags";
};

export const FIELD_SCHEMAS: Record<string, FieldDef[]> = {
  event: [
    { key: "event_name", label: "Event name", required: true, type: "string" },
    { key: "organiser", label: "Organiser", required: false, type: "string" },
    { key: "start_date", label: "Start date", required: true, type: "date" },
    { key: "end_date", label: "End date", required: false, type: "date" },
    { key: "venue", label: "Venue", required: false, type: "string" },
    { key: "city", label: "City", required: false, type: "string" },
    { key: "mode", label: "Mode", required: false, type: "string" },
    { key: "registration_deadline", label: "Registration deadline", required: false, type: "date" },
    { key: "eligibility", label: "Eligibility", required: false, type: "string" },
    { key: "registration_url", label: "Registration link", required: false, type: "url" },
    { key: "tags", label: "Tags", required: false, type: "tags" },
    { key: "source_url", label: "Source", required: true, type: "url" },
    { key: "source_adapter", label: "Source adapter", required: false, type: "string" },
  ],
};

export function schemaFor(entityType: string): FieldDef[] {
  return FIELD_SCHEMAS[entityType] ?? FIELD_SCHEMAS.event;
}

export function fieldLabel(entityType: string, key: string): string {
  return schemaFor(entityType).find((f) => f.key === key)?.label ?? key;
}

// Field keys allowed in record data — model output is whitelisted against this.
export function isKnownField(entityType: string, key: string): boolean {
  return schemaFor(entityType).some((f) => f.key === key);
}
