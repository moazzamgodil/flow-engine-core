import type { WorkflowEventMap } from '../types/index.js';

type AnyContext = Record<string, unknown>;
type GlobalEventMap = WorkflowEventMap<AnyContext>;

export type FlowLifecycleEvent = 'workflowStarted' | 'workflowCompleted' | 'workflowFailed' | 'workflowCancelled';

export interface FlowHooks {
  started?: (payload: GlobalEventMap['workflowStarted']) => void;
  completed?: (payload: GlobalEventMap['workflowCompleted']) => void;
  failed?: (payload: GlobalEventMap['workflowFailed']) => void;
  cancelled?: (payload: GlobalEventMap['workflowCancelled']) => void;
}

const listenersByEvent = new Map<FlowLifecycleEvent, Set<(payload: unknown) => void>>([
  ['workflowStarted', new Set()],
  ['workflowCompleted', new Set()],
  ['workflowFailed', new Set()],
  ['workflowCancelled', new Set()],
]);

function getFlowName(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const record = payload as { name?: unknown };
  return typeof record.name === 'string' ? record.name : undefined;
}

function matchesFlow(targetFlow: string, payload: unknown): boolean {
  return targetFlow === '*' || getFlowName(payload) === targetFlow;
}

export function emitGlobalFlowLifecycleEvent<K extends FlowLifecycleEvent>(event: K, payload: GlobalEventMap[K]): void {
  const listeners = listenersByEvent.get(event);
  if (!listeners) {
    return;
  }
  for (const listener of listeners) {
    listener(payload);
  }
}

export function onFlowEvent<K extends FlowLifecycleEvent>(
  flowName: string,
  event: K,
  listener: (payload: GlobalEventMap[K]) => void,
): () => void {
  const wrapped = (payload: unknown) => {
    if (!matchesFlow(flowName, payload)) {
      return;
    }
    listener(payload as GlobalEventMap[K]);
  };

  const listeners = listenersByEvent.get(event);
  if (!listeners) {
    return () => undefined;
  }

  listeners.add(wrapped);
  return () => {
    listeners.delete(wrapped);
  };
}

export function onFlowHooks(flowName: string, hooks: FlowHooks): () => void {
  const unsubs: Array<() => void> = [];

  if (hooks.started) {
    unsubs.push(onFlowEvent(flowName, 'workflowStarted', hooks.started));
  }
  if (hooks.completed) {
    unsubs.push(onFlowEvent(flowName, 'workflowCompleted', hooks.completed));
  }
  if (hooks.failed) {
    unsubs.push(onFlowEvent(flowName, 'workflowFailed', hooks.failed));
  }
  if (hooks.cancelled) {
    unsubs.push(onFlowEvent(flowName, 'workflowCancelled', hooks.cancelled));
  }

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}
