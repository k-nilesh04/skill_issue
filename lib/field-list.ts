// Client-safe field list (labels only — mirrors lib/fields.ts without server imports).
export const allFields: { key: string; label: string }[] = [
  { key: "event_name", label: "Event name" },
  { key: "organiser", label: "Organiser" },
  { key: "start_date", label: "Start date" },
  { key: "end_date", label: "End date" },
  { key: "venue", label: "Venue" },
  { key: "city", label: "City" },
  { key: "mode", label: "Mode" },
  { key: "registration_deadline", label: "Registration deadline" },
  { key: "eligibility", label: "Eligibility" },
  { key: "registration_url", label: "Registration link" },
  { key: "tags", label: "Tags" },
  { key: "source_url", label: "Source" },
];
