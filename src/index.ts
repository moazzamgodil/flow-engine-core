import { onFlowEvent, onFlowHooks } from './events/global-flow-hooks.js';
import type { FlowHooks, FlowLifecycleEvent } from './events/global-flow-hooks.js';
import type { EngineConfig, StorageAdapter, WorkflowEventMap } from './types/index.js';
import type { WorkflowBuilder } from './workflow/workflow-builder.js';
import { createFlowRuntime } from './workflow/create-runtime.js';

const defaultRuntime = createFlowRuntime<Record<string, unknown>>();

export function workflow<TContext extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
): WorkflowBuilder<TContext> {
  return defaultRuntime.workflow(name) as WorkflowBuilder<TContext>;
}

export function onWorkflowEvent<K extends keyof WorkflowEventMap<Record<string, unknown>>>(
  event: K,
  listener: (payload: WorkflowEventMap<Record<string, unknown>>[K]) => void,
): () => void {
  return defaultRuntime.on(event, listener);
}

export function shutdown(reason?: string): void {
  defaultRuntime.shutdown(reason);
}

export function createRuntime<TContext extends Record<string, unknown>>(input?: {
  config?: EngineConfig;
  storage?: StorageAdapter<TContext>;
}): {
  workflow: (name: string) => WorkflowBuilder<TContext>;
  on: <K extends keyof WorkflowEventMap<TContext>>(
    event: K,
    listener: (payload: WorkflowEventMap<TContext>[K]) => void,
  ) => () => void;
  shutdown: (reason?: string) => void;
} {
  const runtime = createFlowRuntime<TContext>(input?.config, input?.storage);
  return {
    workflow: runtime.workflow,
    on: runtime.on,
    shutdown: runtime.shutdown,
  };
}

export { onFlowEvent, onFlowHooks };
export type { FlowHooks, FlowLifecycleEvent };

export { InMemoryStorageAdapter } from './persistence/in-memory-adapter.js';
export { RedisStorageAdapter } from './persistence/redis-adapter.js';
export { PostgresStorageAdapter } from './persistence/postgres-adapter.js';
export { MongoStorageAdapter } from './persistence/mongo-adapter.js';
export { WorkflowMetricsHelper, createWorkflowMetricsHelper } from './metrics/workflow-metrics.js';
export { parseDelay } from './delay/parse-delay.js';
export { FlowEngine } from './core/engine.js';
export { WorkflowBuilder } from './workflow/workflow-builder.js';
export type {
  EngineConfig,
  InternalStep,
  LoggerHooks,
  RetryOptions,
  StepHandler,
  StepOptions,
  StorageAdapter,
  WorkflowContext,
  WorkflowEventMap,
  WorkflowRecord,
  WorkflowRunOptions,
  WorkflowStatus,
} from './types/index.js';
export type {
  MongoCollectionLike,
  MongoDbLike,
  MongoStorageAdapterOptions,
} from './persistence/mongo-adapter.js';
export type {
  PostgresLikeClient,
  PostgresQueryResult,
  PostgresStorageAdapterOptions,
} from './persistence/postgres-adapter.js';
export type { RedisLikeClient, RedisStorageAdapterOptions } from './persistence/redis-adapter.js';
export type {
  DurationStats,
  MetricsCounters,
  WorkflowEventSource,
  WorkflowMetricsSnapshot,
} from './metrics/workflow-metrics.js';
export { WorkflowError } from './errors/workflow-error.js';
export { StepTimeoutError } from './errors/step-timeout-error.js';
export { RetryLimitExceededError } from './errors/retry-limit-exceeded-error.js';
export { ValidationError } from './errors/validation-error.js';
export { PersistenceError } from './errors/persistence-error.js';
