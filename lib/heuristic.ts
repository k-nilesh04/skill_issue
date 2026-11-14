// Deterministic heuristic implementations used when no OPENAI_API_KEY is configured.
// They produce the same JSON shapes as the model contracts, from the actual input text.
// The extractor only emits a field when a regex-backed verbatim quote exists in the
// content — it cannot invent values.

import type { ExtractedRecord, Interpretation, Plan, PlanSource } from "./types";
import { DEFAULT_FIELDS, DEFAULT_RULES, DEFAULT_STEPS } from "./plan-defaults";

// ---- language / dates

export function detectLanguage(q: string): "en" | "hi" {
  return /[\u0900-\u097F]/.test(q) ? "hi" : "en";
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- interpretation

const CITY_MAP: [RegExp, string][] = [
  [/delhi\s*(ncr|nct)?|दिल्ली|new delhi|gurgaon|गुरुग्राम|gurugram|noida|नोएडा|ghaziabad|faridabad/i, "Delhi NCR"],
  [/bengaluru|bangalore|बेंगलुरु|बैंगलोर/i, "Bengaluru"],
  [/mumbai|मुंबई/i, "Mumbai"],
  [/hyderabad|हैदराबाद/i, "Hyderabad"],
  [/pune|पुणे/i, "Pune"],
  [/chennai|चेन्नई/i, "Chennai"],
  [/kolkata|कोलकाता/i, "Kolkata"],
  [/ahmedabad|अहमदाबाद/i, "Ahmedabad"],
  [/jaipur|जयपुर/i, "Jaipur"],
];

export function heuristicInterpret(query: string): Interpretation & { detected_language: string } {
  const lang = detectLanguage(query);
  // window: "next N days" / "अगले N दिनों"
  let days = 30;
  const mEn = query.match(/next\s+(\d+)\s+days?/i);
  const mHi = query.match(/अगले\s+(\d+)\s+दिनों/);
  if (mEn) days = parseInt(mEn[1], 10);
  else if (mHi) days = parseInt(mHi[1], 10);

  let location: string | null = null;
  for (const [re, city] of CITY_MAP) {
    if (re.test(query)) {
      location = city;
      break;
    }
  }

  // requested fields: explicit mentions map to schema keys
  const fieldMentions: [RegExp, string][] = [
    [/event name|नाम/i, "event_name"],
    [/organis?er|आयोजक/i, "organiser"],
    [/date|तारीख/i, "start_date"],
    [/venue|स्थान/i, "venue"],
    [/city|शहर/i, "city"],
    [/deadline|अंतिम तिथि/i, "registration_deadline"],
    [/eligibility|पात्रता/i, "eligibility"],
    [/registration link|लिंक/i, "registration_url"],
    [/source|स्रोत/i, "source_url"],
  ];
  const fields = new Set<string>();
  for (const [re, key] of fieldMentions) if (re.test(query)) fields.add(key);
  if (fields.size === 0) for (const f of DEFAULT_FIELDS) fields.add(f);
  if (fields.has("event_name")) fields.add("start_date");
  fields.add("source_url");

  const entityIsEvent = /event|meetup|hackathon|conference|इवेंट|मीटअप|हैकाथॉन|कॉन्फ्रेंस/i.test(query);

  const keywords: string[] = [];
  for (const [re, kw] of [
    [/ai|artificial intelligence|एआई|ए\.?आई/i, "AI"],
    [/developer|dev |डेवलपर/i, "developer"],
    [/meetup|मीटअप/i, "meetup"],
    [/hackathon|हैकाथॉन/i, "hackathon"],
    [/conference|कॉन्फ्रेंस/i, "conference"],
  ] as [RegExp, string][]) {
    if (re.test(query)) keywords.push(kw);
  }

  const ambiguities = [] as { concern: string; default_applied: string }[];
  if (!mEn && !mHi) {
    ambiguities.push(
      lang === "hi"
        ? { concern: "कोई समय-सीमा नहीं बताई गई", default_applied: "अगले 30 दिनों की डिफ़ॉल्ट विंडो लागू की गई" }
        : { concern: "no explicit time window stated", default_applied: "defaulted to next 30 days" }
    );
  }
  if (!location) {
    ambiguities.push(
      lang === "hi"
        ? { concern: "कोई स्थान नहीं बताया गया", default_applied: "सभी भारतीय शहरों को शामिल किया गया" }
        : { concern: "no location stated", default_applied: "defaulted to all India" }
    );
  }
  if (fields.size === DEFAULT_FIELDS.length && !fieldMentions.some(([re]) => re.test(query))) {
    ambiguities.push(
      lang === "hi"
        ? { concern: "आवश्यक फ़ील्ड स्पष्ट नहीं हैं", default_applied: "सभी मानक इवेंट फ़ील्ड शामिल किए गए" }
        : { concern: "required fields not stated explicitly", default_applied: "included all standard event fields" }
    );
  }

  const summary =
    lang === "hi"
      ? `${location ?? "भारत"} में ${isoToday()} से ${isoDaysFromToday(days)} तक होने वाले ${keywords.join(", ") || "टेक"} इवेंट खोजने का अनुरोध।`
      : `Request to find ${keywords.join(", ") || "tech"} events${location ? ` in ${location}` : " in India"} between ${isoToday()} and ${isoDaysFromToday(days)}.`;

  return {
    detected_language: lang,
    entity_type: entityIsEvent ? "event" : "event", // v1 supports the event domain only
    summary,
    fields: [...fields],
    location,
    date_from: isoToday(),
    date_to: isoDaysFromToday(days),
    keywords: keywords.length ? keywords : ["tech", "events"],
    ambiguities,
  };
}

// ---- planning

export function heuristicPlan(interpretation: Interpretation, enabledAdapters: string[], language: string): Plan {
  const hi = language === "hi";
  const sources: PlanSource[] = [];
  if (enabledAdapters.includes("web_search"))
    sources.push({
      adapter: "web_search",
      enabled: true,
      rationale: hi
        ? "वेब खोज से व्यापक खोज — मीटअप, हैकाथॉन और कॉन्फ्रेंस सब के लिए।"
        : "Broad web discovery via the search API — covers meetups, hackathons and conferences.",
    });
  if (enabledAdapters.includes("devfolio"))
    sources.push({
      adapter: "devfolio",
      enabled: true,
      rationale: hi
        ? "Devfolio की सार्वजनिक भारत हैकाथॉन लिस्टिंग — हैकाथॉन के लिए सटीक।"
        : "Devfolio public India hackathon listings — precise for hackathons.",
    });

  const kw = (interpretation.keywords.length ? interpretation.keywords : ["AI", "developer"]).slice(0, 3).join(" ");
  const city = interpretation.location ?? "India";
  const month = monthName(interpretation.date_from);
  const search_queries = [
    `${kw} ${city === "Delhi NCR" ? "Delhi NCR" : city} ${month} 2026 registration`,
    `${kw} meetup hackathon ${city === "Delhi NCR" ? "Delhi NCR" : city} upcoming`,
    `${interpretation.keywords.includes("conference") || /conference/i.test(interpretation.summary) ? "developer" : "tech"} conference India ${month} 2026`,
    `${kw} event ${city === "Delhi NCR" ? "Delhi NCR" : city} registration link`,
  ];

  return {
    sources,
    search_queries,
    devfolio_filters: {
      keywords: interpretation.keywords.length ? interpretation.keywords.slice(0, 4) : ["AI", "hackathon"],
      mode: "offline",
    },
    steps: DEFAULT_STEPS,
    validation_rules: DEFAULT_RULES,
  };
}

function monthName(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleString("en-IN", { month: "long", timeZone: "UTC" });
}

// ---- extraction (rule-based, quote-backed)

function grabDate(re: RegExp, content: string): { value: string; quote: string } | null {
  const m = content.match(re);
  if (!m) return null;
  const quote = trimQuote(content, m.index!, m[0].length);
  const iso = normalizeDate(m[1]);
  if (!iso) return null;
  return { value: iso, quote };
}

function trimQuote(content: string, index: number, len: number): string {
  const start = Math.max(0, index - 30);
  const end = Math.min(content.length, index + len + 30);
  return content.slice(start, end).trim();
}

export function normalizeDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
    if (!isNaN(d.getTime()) && m[2] >= "01" && m[2] <= "12") return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  m = s.match(/(\d{1,2})(st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i);
  if (m) {
    const d = new Date(`${m[4]}-${monthNum(m[3])}-${m[1].padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  m = s.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m) {
    const d = new Date(`${m[3]}-${monthNum(m[1])}-${m[2].padStart(2, "0")}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function monthNum(name: string): string {
  return String(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(
      name.toLowerCase()
    ) + 1
  ).padStart(2, "0");
}

export function heuristicExtract(src: { title: string; url: string; content: string }): ExtractedRecord[] {
  const c = src.content;
  const fields: Record<string, { value: string; quote: string }> = {};

  const add = (key: string, value: string, quote: string) => {
    if (value && value.trim()) fields[key] = { value: value.trim().slice(0, 500), quote: quote.slice(0, 300) };
  };

  const name = c.match(/Event:\s*(.+?)(?:\.|,)/);
  if (name) add("event_name", name[1], trimQuote(c, name.index!, name[0].length));
  else if (src.title) add("event_name", src.title, src.title);

  const org = c.match(/Organized by\s*(.+?)\./);
  if (org) add("organiser", org[1], trimQuote(c, org.index!, org[0].length));

  const start = grabDate(/(?:starts on|scheduled for|starts|is on|dates?:)\s*(\d{4}-\d{2}-\d{2})/i, c);
  if (start) add("start_date", start.value, start.quote);
  const end = grabDate(/ends on\s*(\d{4}-\d{2}-\d{2})/i, c);
  if (end) add("end_date", end.value, end.quote);

  const venue = c.match(/Venue:\s*(.+?)\.\s*City:/);
  if (venue) add("venue", venue[1], trimQuote(c, venue.index!, venue[0].length));
  const city = c.match(/City:\s*(.+?)\./);
  if (city) add("city", city[1], trimQuote(c, city.index!, city[0].length));
  const mode = c.match(/Mode:\s*(in-person|online|hybrid)/i);
  if (mode) add("mode", mode[1].toLowerCase(), trimQuote(c, mode.index!, mode[0].length));

  const deadline = grabDate(/(?:Register by|Registration deadline:|registration closed.*?;)\s*.{0,40}?(\d{4}-\d{2}-\d{2})/i, c);
  if (deadline) add("registration_deadline", deadline.value, deadline.quote);

  const elig = c.match(/Eligibility:\s*(.+?)\./);
  if (elig) add("eligibility", elig[1], trimQuote(c, elig.index!, elig[0].length));

  const regUrl = c.match(/Registration link:\s*(https?:\/\/[^\s]+)/i) || c.match(/Register at\s*(https?:\/\/[^\s]+)/i);
  if (regUrl) add("registration_url", regUrl[1], trimQuote(c, regUrl.index!, regUrl[0].length));

  const tags = c.match(/Tags:\s*(.+?)\./);
  if (tags) add("tags", tags[1], trimQuote(c, tags.index!, tags[0].length));

  // source_url: always the result's own URL — it IS the provenance
  add("source_url", src.url, src.url);

  if (!fields.event_name) return []; // no evidence of an event in this content
  return [{ fields }];
}

// ---- CSV mapping fallback

export function heuristicMapping(headers: string[]): Record<string, string | null> {
  const candidates: [RegExp, string][] = [
    [/event|name|title/i, "event_name"],
    [/organis|host|by/i, "organiser"],
    [/start.*date|date/i, "start_date"],
    [/end.*date/i, "end_date"],
    [/venue|location|place/i, "venue"],
    [/city/i, "city"],
    [/mode/i, "mode"],
    [/deadline|register.*by/i, "registration_deadline"],
    [/eligib/i, "eligibility"],
    [/registration.*link|register.*url|signup/i, "registration_url"],
    [/tag|categor/i, "tags"],
    [/source.*url|link|url/i, "source_url"],
  ];
  const out: Record<string, string | null> = {};
  for (const h of headers) {
    out[h] = null;
    for (const [re, key] of candidates) {
      if (re.test(h)) {
        out[h] = key;
        break;
      }
    }
  }
  return out;
}

// ---- diff summary fallback

export function templateDiffSummary(
  b: { newCount: number; changedCount: number; missingCount: number; unchangedCount: number },
  language: string,
  changedFieldDetail?: string
): string {
  if (language === "hi") {
    const parts: string[] = [];
    parts.push(`${b.newCount} नए इवेंट मिले`);
    if (b.changedCount) parts.push(`${b.changedCount} इवेंट${changedFieldDetail ? ` (${changedFieldDetail})` : ""} में बदलाव हुआ`);
    if (b.missingCount) parts.push(`${b.missingCount} इवेंट अब नहीं दिख रहे`);
    if (!b.newCount && !b.changedCount && !b.missingCount) parts.push("पिछली रन के बाद कोई बदलाव नहीं");
    return parts.join(", ") + "।";
  }
  const parts: string[] = [];
  parts.push(`${b.newCount} new record${b.newCount === 1 ? "" : "s"} found`);
  if (b.changedCount) parts.push(`${b.changedCount} changed${changedFieldDetail ? ` (${changedFieldDetail})` : ""}`);
  if (b.missingCount) parts.push(`${b.missingCount} no longer present`);
  if (!b.newCount && !b.changedCount && !b.missingCount) parts.push("no changes since the previous run");
  return parts.join(", ") + ".";
}
