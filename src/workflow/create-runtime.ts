import { resolveConfig } from '../core/config.js';
import { FlowEngine } from '../core/engine.js';
import { emitGlobalFlowLifecycleEvent } from '../events/global-flow-hooks.js';
import { InMemoryStorageAdapter } from '../persistence/in-memory-adapter.js';
import type { EngineConfig, StorageAdapter, WorkflowEventMap } from '../types/index.js';
import { WorkflowBuilder } from './workflow-builder.js';

export interface FlowRuntime<TContext extends Record<string, unknown>> {
  workflow: (name: string) => WorkflowBuilder<TContext>;
  on: <K extends keyof WorkflowEventMap<TContext>>(
    event: K,
    listener: (payload: WorkflowEventMap<TContext>[K]) => void,
  ) => () => void;
  shutdown: (reason?: string) => void;
  storage: StorageAdapter<TContext>;
}

export function createFlowRuntime<TContext extends Record<string, unknown>>(
  config?: EngineConfig,
  storage: StorageAdapter<TContext> = new InMemoryStorageAdapter<TContext>(),
): FlowRuntime<TContext> {
  const engine = new FlowEngine<TContext>({ storage, config });
  const resolved = resolveConfig(config);

  engine.on('workflowStarted', (payload) => {
    emitGlobalFlowLifecycleEvent('workflowStarted', payload);
  });
  engine.on('workflowCompleted', (payload) => {
    emitGlobalFlowLifecycleEvent('workflowCompleted', payload);
  });
  engine.on('workflowFailed', (payload) => {
    emitGlobalFlowLifecycleEvent('workflowFailed', payload);
  });
  engine.on('workflowCancelled', (payload) => {
    emitGlobalFlowLifecycleEvent('workflowCancelled', payload);
  });

  return {
    workflow: (name: string) =>
      new WorkflowBuilder<TContext>(name, engine, {
        maxSteps: resolved.limits.maxSteps,
        maxParallel: resolved.limits.maxParallel,
      }),
    on: (event, listener) => engine.on(event, listener),
    shutdown: (reason) => engine.shutdown(reason),
    storage,
  };
}
