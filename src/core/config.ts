import type { EngineConfig, RetryOptions, WorkflowLimits } from '../types/index.js';

export interface ResolvedConfig {
  limits: WorkflowLimits;
  retry: Omit<RetryOptions, 'retryable'>;
  now: () => number;
}

export function resolveConfig(config?: EngineConfig): ResolvedConfig {
  return {
    limits: {
      maxSteps: config?.limits?.maxSteps ?? 1000,
      maxParallel: config?.limits?.maxParallel ?? 32,
      maxWorkflowTimeoutMs: config?.limits?.maxWorkflowTimeoutMs ?? 10 * 60_000,
    },
    retry: {
      retries: config?.retry?.retries ?? 0,
      backoffMs: config?.retry?.backoffMs ?? 100,
      maxBackoffMs: config?.retry?.maxBackoffMs ?? 5_000,
      jitter: config?.retry?.jitter ?? 0.2,
    },
    now: config?.now ?? Date.now,
  };
}
