import { constants } from "node:fs";
import {
  appendFile,
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { UsageSnapshot, UsageWindow } from "./usage.ts";

export type RefreshReason =
  | "session_start"
  | "model_select"
  | "agent_settled"
  | "usage";

export interface QuotaObservationV1 {
  schemaVersion: 1;
  observedAt: string;
  runtimeSeriesId: string;
  refreshReason: RefreshReason;
  providerId: UsageSnapshot["providerId"];
  plan?: string;
  windows: UsageSnapshot["windows"];
}

export interface HistoryDiagnostic {
  shard: string;
  line?: number;
  reason: string;
}

export interface HistoryReadResult {
  observations: QuotaObservationV1[];
  diagnostics: HistoryDiagnostic[];
}

export interface QuotaObservationMetadata {
  observedAt: Date;
  runtimeSeriesId: string;
  refreshReason: RefreshReason;
}

export interface QuotaHistoryHealth {
  enabled: boolean;
  diagnostic?: "storage_unavailable";
}

export interface QuotaHistory {
  record(snapshot: UsageSnapshot, reason: RefreshReason): void;
  read(): Promise<HistoryReadResult>;
  flush(deadlineMs: number): Promise<void>;
  health(): QuotaHistoryHealth;
}

export interface QuotaHistoryOptions {
  stateRoot?: string;
  clock?: () => Date;
  runtimeSeriesId?: string;
  stderr?: Pick<NodeJS.WriteStream, "write">;
}

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RETENTION_WRITE_INTERVAL = 64;
const MAX_DIAGNOSTICS = 100;
const MAX_STRING_LENGTH = 256;
const SHARD_PATTERN = /^runtime-.+\.jsonl$/;

export function resolveQuotaHistoryStateRoot(
  xdgStateHome = process.env.XDG_STATE_HOME,
): string {
  return xdgStateHome && isAbsolute(xdgStateHome)
    ? xdgStateHome
    : join(homedir(), ".local", "state");
}

export function createQuotaObservation(
  snapshot: UsageSnapshot,
  metadata: QuotaObservationMetadata,
): QuotaObservationV1 {
  return {
    schemaVersion: 1,
    observedAt: metadata.observedAt.toISOString(),
    runtimeSeriesId: metadata.runtimeSeriesId,
    refreshReason: metadata.refreshReason,
    providerId: snapshot.providerId,
    ...(snapshot.plan === undefined ? {} : { plan: snapshot.plan }),
    windows: snapshot.windows.map((window) => ({
      id: window.id,
      label: window.label,
      usedPercent: window.usedPercent,
      ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      ...(window.scope === undefined ? {} : { scope: window.scope }),
      ...(window.modelId === undefined ? {} : { modelId: window.modelId }),
    })),
  };
}

const REFRESH_REASONS = new Set<RefreshReason>([
  "session_start",
  "model_select",
  "agent_settled",
  "usage",
]);

function boundedString(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= MAX_STRING_LENGTH &&
    (allowEmpty || value.length > 0);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || boundedString(value, true);
}

function projectWindow(value: unknown): UsageWindow | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const window = value as Record<string, unknown>;
  if (!boundedString(window.id) || !boundedString(window.label) ||
    typeof window.usedPercent !== "number" || !Number.isFinite(window.usedPercent) ||
    window.usedPercent < 0 || window.usedPercent > 100 ||
    !optionalString(window.scope) || !optionalString(window.modelId) ||
    (window.resetsAt !== undefined &&
      (typeof window.resetsAt !== "number" || !Number.isSafeInteger(window.resetsAt) || window.resetsAt < 0))) {
    return undefined;
  }
  return {
    id: window.id,
    label: window.label,
    usedPercent: window.usedPercent,
    ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    ...(window.scope === undefined ? {} : { scope: window.scope }),
    ...(window.modelId === undefined ? {} : { modelId: window.modelId }),
  };
}

function isCanonicalUtcDate(value: unknown): value is string {
  if (!boundedString(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function projectObservation(value: unknown): QuotaObservationV1 | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const observation = value as Record<string, unknown>;
  if (observation.schemaVersion !== 1 || !isCanonicalUtcDate(observation.observedAt) ||
    !boundedString(observation.runtimeSeriesId) ||
    !REFRESH_REASONS.has(observation.refreshReason as RefreshReason) ||
    (observation.providerId !== "openai-codex" && observation.providerId !== "anthropic") ||
    !optionalString(observation.plan) || !Array.isArray(observation.windows) ||
    observation.windows.length > 100) {
    return undefined;
  }
  const windows = observation.windows.map(projectWindow);
  if (windows.some((window) => window === undefined)) return undefined;
  return {
    schemaVersion: 1,
    observedAt: observation.observedAt,
    runtimeSeriesId: observation.runtimeSeriesId,
    refreshReason: observation.refreshReason as RefreshReason,
    providerId: observation.providerId,
    ...(observation.plan === undefined ? {} : { plan: observation.plan }),
    windows: windows as UsageWindow[],
  };
}

function parseShard(shard: string, contents: string, includeDiagnostics: boolean): HistoryReadResult {
  const observations: QuotaObservationV1[] = [];
  const diagnostics: HistoryDiagnostic[] = [];
  const diagnose = (diagnostic: HistoryDiagnostic): void => {
    if (includeDiagnostics && diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic);
  };
  const lines = contents.split("\n");
  const hasTrailingNewline = contents.endsWith("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      diagnose({
        shard,
        line: index + 1,
        reason: !hasTrailingNewline && index === lines.length - 1
          ? "partial trailing line"
          : "malformed JSON line",
      });
      continue;
    }
    const observation = projectObservation(value);
    if (observation) observations.push(observation);
    else diagnose({
      shard,
      line: index + 1,
      reason: value !== null && typeof value === "object" &&
          (value as Record<string, unknown>).schemaVersion !== undefined &&
          (value as Record<string, unknown>).schemaVersion !== 1
        ? "unsupported observation schema"
        : "invalid observation schema",
    });
  }
  return { observations, diagnostics };
}

export function createQuotaHistory(options: QuotaHistoryOptions = {}): QuotaHistory {
  const stateRoot = options.stateRoot ?? resolveQuotaHistoryStateRoot();
  const clock = options.clock ?? (() => new Date());
  const runtimeSeriesId = options.runtimeSeriesId ?? randomUUID();
  const stderr = options.stderr ?? process.stderr;
  const historyDir = join(stateRoot, "pi", "subscription-usage");
  const shardName = `runtime-${runtimeSeriesId}.jsonl`;
  const shardPath = join(historyDir, shardName);
  let enabled = true;
  let diagnosed = false;
  let queuedWrites = 0;
  let queue = Promise.resolve();

  function disable(): void {
    enabled = false;
    if (diagnosed) return;
    diagnosed = true;
    try {
      stderr.write("subscription-usage: quota history storage unavailable; history disabled\n");
    } catch {
      // Diagnostics are best effort too.
    }
  }

  async function appendObservation(observation: QuotaObservationV1): Promise<void> {
    await mkdir(historyDir, { recursive: true, mode: 0o700 });
    await chmod(historyDir, 0o700);
    const noFollow = constants.O_NOFOLLOW ?? 0;
    const handle = await open(
      shardPath,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | noFollow,
      0o600,
    );
    try {
      await handle.chmod(0o600);
      await appendFile(handle, `${JSON.stringify(observation)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  }

  async function retain(now: Date): Promise<void> {
    await mkdir(historyDir, { recursive: true, mode: 0o700 });
    const cutoff = now.getTime() - RETENTION_MS;
    const entries = await readdir(historyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !SHARD_PATTERN.test(entry.name)) continue;
      const path = join(historyDir, entry.name);
      const before = await stat(path);
      const parsed = parseShard(entry.name, await readFile(path, "utf8"), false);
      if (entry.name === shardName) {
        const retained = parsed.observations.filter((item) => Date.parse(item.observedAt) >= cutoff);
        const temporaryPath = `${shardPath}.retention-${randomUUID()}`;
        await writeFile(temporaryPath, retained.map((item) => JSON.stringify(item)).join("\n") + (retained.length ? "\n" : ""), {
          encoding: "utf8",
          mode: 0o600,
          flag: "wx",
        });
        await rename(temporaryPath, shardPath);
        continue;
      }
      const newest = parsed.observations.reduce(
        (latest, item) => Math.max(latest, Date.parse(item.observedAt)),
        Number.NEGATIVE_INFINITY,
      );
      if (newest >= cutoff || before.mtimeMs >= cutoff || !Number.isFinite(newest)) continue;
      const after = await stat(path);
      if (before.dev === after.dev && before.ino === after.ino &&
        before.size === after.size && before.mtimeMs === after.mtimeMs) {
        await unlink(path);
      }
    }
  }

  async function readAll(): Promise<HistoryReadResult> {
    let entries;
    try {
      entries = await readdir(historyDir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { observations: [], diagnostics: [] };
      throw error;
    }
    const observations: Array<{ observation: QuotaObservationV1; shard: string }> = [];
    const diagnostics: HistoryDiagnostic[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !SHARD_PATTERN.test(entry.name)) continue;
      const parsed = parseShard(entry.name, await readFile(join(historyDir, entry.name), "utf8"), true);
      observations.push(...parsed.observations.map((observation) => ({ observation, shard: entry.name })));
      diagnostics.push(...parsed.diagnostics);
    }
    observations.sort((left, right) => Date.parse(left.observation.observedAt) - Date.parse(right.observation.observedAt));

    const series = new Set(observations.map(({ observation }) => observation.runtimeSeriesId));
    if (series.size > 1 && diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push({
        shard: [...observations].sort((left, right) => left.shard.localeCompare(right.shard))[0].shard,
        reason: "multiple anonymous runtime series observed",
      });
    }
    const latestWindows = new Map<string, UsageWindow>();
    for (const { observation, shard } of observations) {
      let decreased = false;
      for (const window of observation.windows) {
        const key = JSON.stringify([observation.providerId, window.id]);
        const prior = latestWindows.get(key);
        if (prior && prior.resetsAt === window.resetsAt && window.usedPercent < prior.usedPercent) {
          decreased = true;
        }
        latestWindows.set(key, window);
      }
      if (decreased && diagnostics.length < MAX_DIAGNOSTICS) {
        diagnostics.push({ shard, reason: "usage decreased without window reset" });
      }
    }
    return {
      observations: observations.map(({ observation }) => observation),
      diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS),
    };
  }

  return {
    record(snapshot, reason) {
      if (!enabled) return;
      const observation = createQuotaObservation(snapshot, {
        observedAt: clock(),
        runtimeSeriesId,
        refreshReason: reason,
      });
      const shouldRetain = queuedWrites++ % RETENTION_WRITE_INTERVAL === 0;
      queue = queue.then(async () => {
        if (!enabled) return;
        try {
          if (shouldRetain) await retain(new Date(observation.observedAt));
          await appendObservation(observation);
        } catch {
          disable();
        }
      });
    },

    async read() {
      if (!enabled) return { observations: [], diagnostics: [] };
      await queue;
      try {
        return await readAll();
      } catch {
        disable();
        return { observations: [], diagnostics: [] };
      }
    },

    async flush(deadlineMs) {
      if (deadlineMs <= 0) return;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        queue,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, deadlineMs);
        }),
      ]);
      if (timeout !== undefined) clearTimeout(timeout);
    },

    health() {
      return enabled
        ? { enabled: true }
        : { enabled: false, diagnostic: "storage_unavailable" };
    },
  };
}
