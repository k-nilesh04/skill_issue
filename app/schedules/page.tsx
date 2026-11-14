"use client";
// Schedules — table with pause/resume, edit frequency, Run Now, Delete, next-run
// countdown and last-diff badge. Client calls /api/scheduler/tick on load and every 60s.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Select, Skeleton, fmtIST, relTime } from "@/components/ui";

type Schedule = {
  id: string;
  workflow_id: string;
  workflow_title: string;
  frequency: string;
  next_run_at: string;
  paused: boolean;
  last_run_id: string | null;
  last_diff: { new: number; changed: number; missing: number; unchanged: number } | null;
};

export default function SchedulesPage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[] | null>(null);
  const [workflows, setWorkflows] = useState<{ id: string; title: string }[]>([]);
  const [newWf, setNewWf] = useState("");
  const [newFreq, setNewFreq] = useState("daily");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [sRes, wRes] = await Promise.all([fetch("/api/schedules", { cache: "no-store" }), fetch("/api/workflows", { cache: "no-store" })]);
      const sData = await sRes.json();
      const wData = await wRes.json();
      setSchedules(sData.schedules ?? []);
      setWorkflows(wData.workflows ?? []);
      if (!newWf && wData.workflows?.length) setNewWf(wData.workflows[0].id);
    } catch {
      setSchedules([]);
    }
  }, [newWf]);

  useEffect(() => {
    load();
  }, [load]);

  // honest tick model: on app load + every 60s while open
  useEffect(() => {
    const tick = async () => {
      try {
        await fetch("/api/scheduler/tick", { method: "POST" });
        load();
      } catch {
        /* ignore */
      }
    };
    tick();
    const iv = setInterval(tick, 60_000);
    return () => clearInterval(iv);
  }, [load]);

  async function create() {
    if (!newWf) return;
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId: newWf, frequency: newFreq }),
    });
    load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    try {
      await fetch(`/api/schedules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/schedules/${id}`, { method: "POST" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Schedules"
        subtitle="Recurring collection with run-over-run change detection."
        note="Scheduled runs execute while the workspace is open (checked on load and every 60 seconds). Use Run Now to execute immediately."
      />

      <Card className="mb-6">
        <CardHeader title="Create schedule" subtitle="Pick a workflow and frequency" />
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
            <Select value={newWf} onChange={(e) => setNewWf(e.target.value)} aria-label="Workflow to schedule">
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Frequency</p>
            <Select value={newFreq} onChange={(e) => setNewFreq(e.target.value)} aria-label="Frequency">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </div>
          <Button onClick={create} disabled={!newWf}>
            Create schedule
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Schedules" subtitle={`${schedules?.length ?? 0} configured`} />
        <CardBody className="p-0">
          {!schedules ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : schedules.length === 0 ? (
            <EmptyState message="No schedules yet. Create one above — then Run Now produces a diff on the next run." />
          ) : (
            <div className="slim-scroll overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Workflow</th>
                    <th className="px-3 py-2 font-semibold">Frequency</th>
                    <th className="px-3 py-2 font-semibold">Next run</th>
                    <th className="px-3 py-2 font-semibold">Last diff</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="max-w-56 truncate px-3 py-2 text-slate-800" title={s.workflow_title}>
                        {s.workflow_title}
                      </td>
                      <td className="px-3 py-2">
                        <Select value={s.frequency} onChange={(e) => patch(s.id, { frequency: e.target.value })} disabled={busyId === s.id} className="h-8 w-28 text-xs" aria-label={`Frequency for ${s.workflow_title}`}>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                        </Select>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                        {s.paused ? <span className="text-slate-400">paused</span> : <>{relTime(s.next_run_at)} · {fmtIST(s.next_run_at)}</>}
                      </td>
                      <td className="px-3 py-2">
                        {s.last_diff ? (
                          <Badge tone={s.last_diff.new > 0 ? "green" : s.last_diff.changed > 0 ? "amber" : "slate"}>
                            {`+${s.last_diff.new} new, ${s.last_diff.changed} changed`}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">no run yet</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" onClick={() => runNow(s.id)} disabled={busyId === s.id}>
                            Run Now
                          </Button>
                          <Button size="sm" variant="subtle" onClick={() => patch(s.id, { paused: !s.paused })} disabled={busyId === s.id}>
                            {s.paused ? "Resume" : "Pause"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(s.id)} disabled={busyId === s.id} aria-label={`Delete schedule for ${s.workflow_title}`}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  );
}
