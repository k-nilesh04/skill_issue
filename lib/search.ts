// Tavily-backed web search wrapper (lib/search.ts).
// If TAVILY_API_KEY is set, real search results are returned. If not, webSearch()
// throws SearchNotConfigured — the pipeline then falls back to the labelled SAMPLE
// corpus, and the fallback is stated honestly in logs and UI. No fabricated results.

export class SearchNotConfigured extends Error {
  constructor() {
    super("TAVILY_API_KEY not configured — live web search unavailable");
  }
}

export type WebResult = { title: string; url: string; content: string };

export function hasSearch(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function webSearch(query: string, maxResults = 5): Promise<WebResult[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new SearchNotConfigured();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
  return (data.results ?? []).map((r) => ({
    title: String(r.title ?? "").slice(0, 300),
    url: String(r.url ?? ""),
    content: String(r.content ?? "").slice(0, 6000),
  }));
}
