// Source adapter registry (spec section 8).
// Each adapter is fully isolated: a failure sets its RunSource status=error with the
// real message and the run continues. New adapters = one file + one registry entry.

import { webSearch, hasSearch } from "../search";
import { sampleCorpus, type SampleResult } from "../sample-corpus";

export type SourceResult = { title: string; url: string; content: string };
export type CollectOutput = {
  results: SourceResult[];
  sample: boolean; // true when results come from the labelled SAMPLE corpus (no live key)
  queriesUsed: string[];
};
export type OnLog = (source: string, msg: string, level?: "info" | "warn" | "error") => void;

export type Adapter = {
  id: string;
  label: string;
  isAvailable: () => boolean;
  availableNote?: () => string;
  collect: (
    queryPlan: { search_queries: string[]; devfolio_filters?: { keywords: string[]; mode?: string } },
    filters: { date_from?: string; date_to?: string; location?: string | null },
    onLog: OnLog
  ) => Promise<CollectOutput>;
};

const webSearchAdapter: Adapter = {
  id: "web_search",
  label: "Web Search (Tavily)",
  isAvailable: () => true,
  availableNote: () =>
    hasSearch()
      ? "Live via Tavily"
      : "No TAVILY_API_KEY configured — runs against the labelled SAMPLE corpus",
  async collect(queryPlan, _filters, onLog) {
    const queries = queryPlan.search_queries.slice(0, 5);
    if (!hasSearch()) {
      onLog("web_search", "TAVILY_API_KEY not configured — using labelled SAMPLE corpus (tagged SAMPLE, never mixed with live results)", "warn");
      const results = sampleCorpus() as SampleResult[];
      return { results, sample: true, queriesUsed: queries };
    }
    const all: SourceResult[] = [];
    const seen = new Set<string>();
    let i = 0;
    for (const q of queries) {
      i++;
      try {
        const res = await webSearch(q, 5);
        onLog("web_search", `query ${i}/${queries.length} "${q}" → ${res.length} results`);
        for (const r of res) {
          if (seen.has(r.url)) continue;
          seen.add(r.url);
          all.push(r);
        }
      } catch (e) {
        onLog("web_search", `query ${i}/${queries.length} "${q}" failed: ${(e as Error).message}`, "error");
      }
    }
    return { results: all, sample: false, queriesUsed: queries };
  },
};

const devfolioAdapter: Adapter = {
  id: "devfolio",
  label: "Devfolio",
  isAvailable: () => true,
  availableNote: () => "Public India hackathon listings API",
  async collect(queryPlan, _filters, onLog) {
    const keywords = queryPlan.devfolio_filters?.keywords ?? ["hackathon"];
    const q = encodeURIComponent(keywords.slice(0, 3).join(" "));
    // Documented public endpoint; if unavailable/rate-limited we surface the real error.
    const res = await fetch(`https://api.devfolio.co/api/v1/hackathons/search?q=${q}&page=1&per_page=10`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Devfolio API ${res.status} ${res.statusText}`);
    const data = (await res.json()) as any;
    const list: any[] = Array.isArray(data?.hackathons) ? data.hackathons : Array.isArray(data) ? data : [];
    onLog("devfolio", `search "${keywords.join(", ")}" → ${list.length} listings`);
    const results: SourceResult[] = list.map((h: any) => {
      const url = h.share_url || h.url || `https://devfolio.co/hackathons`;
      return {
        title: String(h.name ?? h.title ?? "Devfolio hackathon"),
        url: String(url),
        content: JSON.stringify(h).slice(0, 6000),
      };
    });
    return { results, sample: false, queriesUsed: [`devfolio: ${keywords.join(", ")}`] };
  },
};

export const ADAPTERS: Adapter[] = [webSearchAdapter, devfolioAdapter];

// Placeholders rendered greyed-out "coming soon" in the plan UI — no behavior attached.
export const COMING_SOON = [
  { id: "meetup", label: "Meetup.com" },
  { id: "konfhub", label: "KonfHub" },
];

export function getAdapter(id: string): Adapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
