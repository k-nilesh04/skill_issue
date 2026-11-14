// SQLite persistence via node:sqlite (built into the Node runtime — no native deps).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_query TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  interpretation_json TEXT,
  plan_json TEXT,
  entity_type TEXT NOT NULL DEFAULT 'event',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'queued',
  started_at TEXT,
  finished_at TEXT,
  stats_json TEXT,
  logs_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  previous_run_id TEXT,
  retried_source TEXT
);
CREATE TABLE IF NOT EXISTS run_sources (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  adapter TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  queries_used_json TEXT,
  found INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  accepted INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT,
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  fields_snapshot_json TEXT NOT NULL,
  source_adapter TEXT NOT NULL,
  source_url TEXT,
  completeness REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  verification TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'accepted',
  rejection_reason TEXT,
  duplicate_of TEXT,
  sample INTEGER NOT NULL DEFAULT 0,
  first_seen_run_id TEXT,
  last_seen_run_id TEXT,
  change_state TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_workflow ON records(workflow_id);
CREATE INDEX IF NOT EXISTS idx_records_identity ON records(workflow_id, identity_key);
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL DEFAULT 'daily',
  next_run_at TEXT NOT NULL,
  paused INTEGER NOT NULL DEFAULT 0,
  last_run_id TEXT,
  last_diff_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  workflow_id TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_outputs (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  stage TEXT NOT NULL,
  label TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sample_records (
  id TEXT PRIMARY KEY,
  identity_key TEXT NOT NULL,
  data_json TEXT NOT NULL,
  fields_snapshot_json TEXT NOT NULL,
  source_adapter TEXT NOT NULL DEFAULT 'sample',
  source_url TEXT,
  completeness REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

const DB_DIR = path.join(process.cwd(), "data");
mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "scout.db");

const globalForDb = globalThis as unknown as { __scoutDb?: DatabaseSync };

function initializeDb(): DatabaseSync {
  const existing = globalForDb.__scoutDb;
  if (existing) return existing;

  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA busy_timeout = 5000;");
  d.exec(SCHEMA);
  globalForDb.__scoutDb = d;
  return d;
}

export function getDb(): DatabaseSync {
  return globalForDb.__scoutDb ?? initializeDb();
}

export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const instance = getDb();
    const value = Reflect.get(instance as object, prop as PropertyKey);
    return typeof value === "function" ? value.bind(instance) : value;
  },
  set(_target, prop, value) {
    Reflect.set(getDb() as object, prop as PropertyKey, value);
    return true;
  },
});


export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return randomUUID();
}

export function getJSON<T>(row: { [key: string]: unknown } | undefined, col: string): T | null {
  if (!row || !row[col]) return null;
  try {
    return JSON.parse(row[col] as string) as T;
  } catch {
    return null;
  }
}

export function parseRow(row: any): any {
  if (!row) return row;
  const out: any = { ...row };
  for (const k of Object.keys(row)) {
    if (k.endsWith("_json")) {
      out[k.slice(0, -5)] = getJSON(row, k);
      delete out[k];
    }
    if (typeof out[k] === "number" && ["paused", "sample"].includes(k.replace(/s$/, ""))) {
      // keep numeric; UI coerces
    }
  }
  return out;
}
