export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'failed'
  | 'completed'
  | 'cancelled'
  | 'timed_out';

export interface RetryOptions {
  retries: number;
  backoffMs: number;
  maxBackoffMs: number;
  jitter: number;
  retryable?: (error: unknown) => boolean;
}

export interface StepOptions {
  retries?: number;
  timeout?: number;
  retryable?: (error: unknown) => boolean;
}

export interface WorkflowLimits {
  maxSteps: number;
  maxParallel: number;
  maxWorkflowTimeoutMs: number;
}

export interface WorkflowRunOptions {
  executionId?: string;
  signal?: AbortSignal;
  timeout?: number;
}

export interface WorkflowRecord<TContext> {
  executionId: string;
  name: string;
  status: WorkflowStatus;
  context: TContext;
  currentIndex: number;
  updatedAt: number;
  startedAt: number;
  error?: WorkflowErrorPayload;
}

export interface WorkflowErrorPayload {
  code: string;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface LoggerHooks {
  debug?: (event: string, data?: unknown) => void;
  info?: (event: string, data?: unknown) => void;
  warn?: (event: string, data?: unknown) => void;
  error?: (event: string, data?: unknown) => void;
}

export interface EngineConfig {
  limits?: Partial<WorkflowLimits>;
  retry?: Partial<Omit<RetryOptions, 'retryable'>>;
  logger?: LoggerHooks;
  now?: () => number;
}

export interface WorkflowEventMap<TContext> {
  workflowStarted: { executionId: string; name: string; context: TContext };
  workflowCompleted: { executionId: string; name: string; context: TContext };
  workflowFailed: { executionId: string; name: string; error: WorkflowErrorPayload };
  workflowCancelled: { executionId: string; name: string };
  stepStarted: { executionId: string; workflow: string; step: string; index: number };
  stepCompleted: { executionId: string; workflow: string; step: string; index: number };
  stepFailed: {
    executionId: string;
    workflow: string;
    step: string;
    index: number;
    error: WorkflowErrorPayload;
  };
}

export interface WorkflowContext<TContext> {
  executionId: string;
  workflowName: string;
  stepName: string;
  signal: AbortSignal;
  emit: <K extends keyof WorkflowEventMap<TContext>>(
    event: K,
    payload: WorkflowEventMap<TContext>[K],
  ) => void;
  logger: LoggerHooks;
  context: TContext;
}

export type StepHandler<TContext> =
  | ((ctx: WorkflowContext<TContext>) => Promise<void>)
  | ((ctx: WorkflowContext<TContext>) => void);

export interface StorageAdapter<TContext> {
  saveWorkflow(record: WorkflowRecord<TContext>): Promise<void>;
  loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null>;
  updateWorkflow(record: WorkflowRecord<TContext>): Promise<void>;
  markDone(executionId: string): Promise<void>;
}

export type InternalStepType = 'step' | 'parallel' | 'delay';

export interface InternalStep<TContext> {
  type: InternalStepType;
  name: string;
  run: (ctx: WorkflowContext<TContext>) => Promise<void>;
  timeout?: number;
  retries?: number;
  retryable?: (error: unknown) => boolean;
}
