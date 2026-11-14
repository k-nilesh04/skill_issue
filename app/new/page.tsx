"use client";
// New Collection — 3-step wizard: Interpreted Request → Collection Plan → Execute.
// Forward navigation is disabled until each step completes (spec section 12).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, Checkbox, Input, JsonViewer, Textarea } from "@/components/ui";
import { StatusPill } from "../page";
import { allFields } from "@/lib/field-list";

const EXAMPLES = [
  {
    label: "English anchor",
    text: "Find upcoming AI and developer meetups, hackathons and technology conferences in Delhi NCR over the next 30 days. Include event name, organiser, date, venue, registration deadline, eligibility, registration link and source.",
  },
  {
    label: "हिंदी anchor",
    text: "अगले 30 दिनों में दिल्ली NCR में होने वाले AI और डेवलपर मीटअप, हैकाथॉन और टेक कॉन्फ्रेंस खोजें। इवेंट का नाम, आयोजक, तारीख, स्थान, रजिस्ट्रेशन की अंतिम तिथि, पात्रता, रजिस्ट्रेशन लिंक और स्रोत शामिल करें।",
  },
  {
    label: "हिंदी short",
    text: "अगले 15 दिनों में बेंगलुरु में AI हैकाथॉन खोजें। नाम, तारीख और रजिस्ट्रेशन लिंक चाहिए।",
  },
];

type Interpretation = {
  entity_type: string;
  summary: string;
  fields: string[];
  location: string | null;
  date_from: string;
  date_to: string;
  keywords: string[];
  ambiguities: { concern: string; default_applied: string }[];
};
type Plan = {
  sources: { adapter: string; enabled: boolean; rationale: string }[];
  search_queries: string[];
  devfolio_filters: { keywords: string[]; mode: string };
  steps: string[];
  validation_rules: string[];
};

export default function NewCollectionPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"en" | "hi" | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interpRaw, setInterpRaw] = useState<unknown>(null);
  const [interpEngine, setInterpEngine] = useState<string>("");
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planRaw, setPlanRaw] = useState<unknown>(null);
  const [planEngine, setPlanEngine] = useState<string>("");
  const [runResult, setRunResult] = useState<{ run_id: string; status: string } | null>(null);

  const detected = useMemo<"EN" | "हिंदी" | null>(() => {
    if (!query.trim()) return null;
    return /[\u0900-\u097F]/.test(query) ? "हिंदी" : "EN";
  }, [query]);

  async function runInterpret() {
    setBusy(true);
    setError(null);
    setPlan(null);
    setStep(0);
    try {
      const res = await fetch("/api/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "interpretation failed");
      setLanguage(data.detected_language);
      setInterpretation(data.interpretation);
      setInterpRaw(data.raw);
      setInterpEngine(data.engine);
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runPlan() {
    if (!interpretation) return;
    setBusy(true);
    setError(null);
    try {
      const adapters = ["web_search", "devfolio"];
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interpretation, enabledAdapters: adapters, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "planning failed");
      setPlan(data.plan);
      setPlanRaw(data.raw);
      setPlanEngine(data.engine);
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const wfRes = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, language, interpretation, plan }),
      });
      const wf = await wfRes.json();
      if (!wfRes.ok) throw new Error(wf.error ?? "saving workflow failed");
      const runRes = await fetch(`/api/workflows/${wf.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const run = await runRes.json();
      if (!runRes.ok) throw new Error(run.error ?? "execution failed");
      setRunResult({ run_id: run.run_id, status: run.status });
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const rail = [
    { n: 1, label: "Interpreted", done: step >= 1 },
    { n: 2, label: "Plan", done: step >= 2 },
    { n: 3, label: "Execute", done: step >= 3 },
  ];

  return (
    <>
      <PageHeader
        title="New Collection"
        subtitle="Describe the data you need in plain English or Hindi. SCOUT interprets, plans, then collects."
        note="No API keys configured: collection runs against the labelled SAMPLE corpus. Add TAVILY_API_KEY and OPENAI_API_KEY to .env.local for live data."
      />

      {/* Query input */}
      <Card className="mb-6">
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="query" className="text-sm font-medium text-slate-700">
              Your data request
            </label>
            {detected ? <Badge tone={detected === "EN" ? "teal" : "amber"}>{detected}</Badge> : null}
          </div>
          <Textarea id="query" rows={4} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Find upcoming AI meetups in Delhi NCR over the next 30 days…" />
          <div className="flex flex-wrap items-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => setQuery(ex.text)}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:border-teal-600 hover:text-teal-700"
              >
                {ex.label}
              </button>
            ))}
          </div>
          {error ? (
            <p className="text-sm text-red-600">
              {error}{" "}
              <Button variant="outline" size="sm" onClick={runInterpret} disabled={busy}>
                Retry
              </Button>
            </p>
          ) : null}
        </CardBody>
      </Card>

      {/* Progress rail */}
      <ol className="mb-6 flex items-center gap-2 text-sm">
        {rail.map((r, i) => (
          <li key={r.n} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${r.done ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-500"}`}>{r.n}</span>
            <span className={r.done ? "font-medium text-teal-800" : "text-slate-500"}>{r.label}</span>
            {i < rail.length - 1 ? <span className="mx-1 h-px w-8 bg-slate-300" /> : null}
          </li>
        ))}
      </ol>

      {/* Step 1 */}
      {step >= 1 && interpretation ? (
        <Card className="mb-6">
          <CardHeader
            title='Step 1 — "Interpreted Request"'
            subtitle={`Stage handled by ${interpEngine === "llm" ? "platform model" : "heuristic fallback (no LLM key)"}: interpretation (EN↔HI supported)`}
            action={<JsonViewer raw={interpRaw} />}
          />
          <CardBody className="space-y-4">
            <p className="text-sm text-slate-700">{interpretation.summary}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Entity type</p>
                  <Input value={interpretation.entity_type} disabled readOnly className="bg-slate-50" />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Fields</p>
                  <div className="grid grid-cols-2 gap-x-4">
                    {allFields.map((f) => (
                      <Checkbox
                        key={f.key}
                        label={f.label}
                        checked={interpretation.fields.includes(f.key)}
                        disabled
                      />
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Field set is read-only in v1 (event schema is fixed).</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                  <Input value={interpretation.location ?? "All India"} disabled readOnly className="bg-slate-50" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date from</p>
                    <Input type="date" value={interpretation.date_from} disabled readOnly className="bg-slate-50" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Date to</p>
                    <Input type="date" value={interpretation.date_to} disabled readOnly className="bg-slate-50" />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Ambiguities &amp; defaults applied</p>
                  <ul className="slim-scroll max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
                    {interpretation.ambiguities.length === 0 ? <li className="text-slate-400">None — every constraint was explicit.</li> : null}
                    {interpretation.ambiguities.map((a, i) => (
                      <li key={i} className="rounded border border-slate-100 bg-slate-50 px-2 py-1">
                        <span className="font-medium">{a.concern}</span> → {a.default_applied}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
            {step === 1 ? (
              <div className="flex justify-end">
                <Button onClick={runPlan} disabled={busy}>
                  {busy ? "Planning…" : "Generate collection plan →"}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* Step 2 */}
      {step >= 2 && plan ? (
        <Card className="mb-6">
          <CardHeader
            title='Step 2 — "Collection Plan"'
            subtitle={`Stage handled by ${planEngine === "llm" ? "platform model" : "heuristic fallback (no LLM key)"}: planning`}
            action={
              <div className="flex gap-2">
                <JsonViewer raw={planRaw} />
                <Button variant="outline" size="sm" onClick={runPlan} disabled={busy}>
                  Regenerate plan
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {plan.sources.map((s) => (
                <div key={s.adapter} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{s.adapter}</p>
                    <Badge tone={s.enabled ? "teal" : "slate"}>{s.enabled ? "enabled" : "disabled"}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{s.rationale}</p>
                </div>
              ))}
              {["meetup", "konfhub"].map((id) => (
                <div key={id} className="rounded-md border border-dashed border-slate-200 p-3 opacity-50" aria-disabled>
                  <p className="text-sm font-semibold text-slate-500">{id}</p>
                  <p className="text-xs text-slate-400">coming soon</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Search queries (English for recall)</p>
              <ol className="slim-scroll max-h-40 list-decimal space-y-1 overflow-y-auto pl-5 text-xs text-slate-600">
                {plan.search_queries.map((q, i) => (
                  <li key={i} className="font-mono">
                    {q}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Validation rules</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {plan.validation_rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dedup key</p>
              <p className="font-mono text-xs text-slate-600">sha1(lowercase(name) | lowercase(city) | start_date)</p>
            </div>
            {step === 2 ? (
              <div className="flex justify-end">
                <Button onClick={execute} disabled={busy}>
                  {busy ? "Executing…" : "Execute collection →"}
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* Step 3 */}
      {step >= 3 && runResult ? (
        <Card>
          <CardHeader title='Step 3 — "Execute"' subtitle="Pipeline executed end-to-end. Open the run in Live Monitor for stages and logs." />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusPill status={runResult.status} />
              <span className="font-mono text-xs text-slate-500">{runResult.run_id.slice(0, 8)}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push(`/monitor?run=${runResult.run_id}`)}>Open in Live Monitor</Button>
              <Button variant="outline" onClick={() => router.push(`/results?workflowRun=${runResult.run_id}`)}>
                View results
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
