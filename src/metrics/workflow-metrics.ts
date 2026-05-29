import type { WorkflowEventMap } from '../types/index.js';

export interface MetricsCounters {
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  workflowsCancelled: number;
  stepsStarted: number;
  stepsCompleted: number;
  stepsFailed: number;
}

export interface DurationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

export interface WorkflowMetricsSnapshot {
  counters: MetricsCounters;
  workflowDuration: DurationStats;
  stepDuration: DurationStats;
}

export interface WorkflowEventSource<TContext> {
  on: <K extends keyof WorkflowEventMap<TContext>>(
    event: K,
    listener: (payload: WorkflowEventMap<TContext>[K]) => void,
  ) => () => void;
}

const createInitialCounters = (): MetricsCounters => ({
  workflowsStarted: 0,
  workflowsCompleted: 0,
  workflowsFailed: 0,
  workflowsCancelled: 0,
  stepsStarted: 0,
  stepsCompleted: 0,
  stepsFailed: 0,
});

const createEmptyDurationStats = (): DurationStats => ({
  count: 0,
  totalMs: 0,
  minMs: 0,
  maxMs: 0,
  avgMs: 0,
});

interface MutableDurationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
}

function createMutableDurationStats(): MutableDurationStats {
  return { count: 0, totalMs: 0, minMs: Number.POSITIVE_INFINITY, maxMs: 0 };
}

function updateStats(target: MutableDurationStats, durationMs: number): void {
  target.count += 1;
  target.totalMs += durationMs;
  target.minMs = Math.min(target.minMs, durationMs);
  target.maxMs = Math.max(target.maxMs, durationMs);
}

function toSnapshot(stats: MutableDurationStats): DurationStats {
  if (stats.count === 0) return createEmptyDurationStats();
  return {
    count: stats.count,
    totalMs: stats.totalMs,
    minMs: stats.minMs,
    maxMs: stats.maxMs,
    avgMs: stats.totalMs / stats.count,
  };
}

export class WorkflowMetricsHelper<TContext extends Record<string, unknown>> {
  private readonly counters: MetricsCounters = createInitialCounters();
  private readonly workflowStartTimes = new Map<string, number>();
  private readonly stepStartTimes = new Map<string, number>();
  private readonly workflowDurations = createMutableDurationStats();
  private readonly stepDurations = createMutableDurationStats();
  private readonly unsubs: Array<() => void> = [];

  public constructor(source: WorkflowEventSource<TContext>) {
    this.unsubs.push(
      source.on('workflowStarted', (payload) => {
        this.counters.workflowsStarted += 1;
        this.workflowStartTimes.set(payload.executionId, Date.now());
      }),
    );
    this.unsubs.push(
      source.on('workflowCompleted', (payload) => {
        this.counters.workflowsCompleted += 1;
        this.captureWorkflowDuration(payload.executionId);
      }),
    );
    this.unsubs.push(
      source.on('workflowFailed', (payload) => {
        this.counters.workflowsFailed += 1;
        this.captureWorkflowDuration(payload.executionId);
      }),
    );
    this.unsubs.push(
      source.on('workflowCancelled', (payload) => {
        this.counters.workflowsCancelled += 1;
        this.captureWorkflowDuration(payload.executionId);
      }),
    );
    this.unsubs.push(
      source.on('stepStarted', (payload) => {
        this.counters.stepsStarted += 1;
        this.stepStartTimes.set(this.stepKey(payload.executionId, payload.index), Date.now());
      }),
    );
    this.unsubs.push(
      source.on('stepCompleted', (payload) => {
        this.counters.stepsCompleted += 1;
        this.captureStepDuration(payload.executionId, payload.index);
      }),
    );
    this.unsubs.push(
      source.on('stepFailed', (payload) => {
        this.counters.stepsFailed += 1;
        this.captureStepDuration(payload.executionId, payload.index);
      }),
    );
  }

  public reset(): void {
    this.counters.workflowsStarted = 0;
    this.counters.workflowsCompleted = 0;
    this.counters.workflowsFailed = 0;
    this.counters.workflowsCancelled = 0;
    this.counters.stepsStarted = 0;
    this.counters.stepsCompleted = 0;
    this.counters.stepsFailed = 0;

    this.workflowStartTimes.clear();
    this.stepStartTimes.clear();
    this.workflowDurations.count = 0;
    this.workflowDurations.totalMs = 0;
    this.workflowDurations.minMs = Number.POSITIVE_INFINITY;
    this.workflowDurations.maxMs = 0;
    this.stepDurations.count = 0;
    this.stepDurations.totalMs = 0;
    this.stepDurations.minMs = Number.POSITIVE_INFINITY;
    this.stepDurations.maxMs = 0;
  }

  public snapshot(): WorkflowMetricsSnapshot {
    return {
      counters: { ...this.counters },
      workflowDuration: toSnapshot(this.workflowDurations),
      stepDuration: toSnapshot(this.stepDurations),
    };
  }

  public detach(): void {
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs.length = 0;
  }

  private stepKey(executionId: string, index: number): string {
    return `${executionId}:${index}`;
  }

  private captureWorkflowDuration(executionId: string): void {
    const startedAt = this.workflowStartTimes.get(executionId);
    if (startedAt === undefined) return;
    this.workflowStartTimes.delete(executionId);
    updateStats(this.workflowDurations, Date.now() - startedAt);
  }

  private captureStepDuration(executionId: string, index: number): void {
    const key = this.stepKey(executionId, index);
    const startedAt = this.stepStartTimes.get(key);
    if (startedAt === undefined) return;
    this.stepStartTimes.delete(key);
    updateStats(this.stepDurations, Date.now() - startedAt);
  }
}

export function createWorkflowMetricsHelper<TContext extends Record<string, unknown>>(
  source: WorkflowEventSource<TContext>,
): WorkflowMetricsHelper<TContext> {
  return new WorkflowMetricsHelper(source);
}
