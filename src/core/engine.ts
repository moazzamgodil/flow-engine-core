import { ValidationError } from '../errors/validation-error.js';
import type {
  EngineConfig,
  InternalStep,
  LoggerHooks,
  StepHandler,
  StepOptions,
  StorageAdapter,
  WorkflowContext,
  WorkflowEventMap,
  WorkflowRecord,
  WorkflowRunOptions,
} from '../types/index.js';
import { TypedEventBus } from '../events/event-bus.js';
import { noopLogger } from '../logging/noop-logger.js';
import { resolveConfig, type ResolvedConfig } from './config.js';
import { ShutdownManager } from './shutdown-manager.js';
import { runWithRetry } from '../retry/run-with-retry.js';
import { withTimeout } from '../step/with-timeout.js';
import { sleep } from '../delay/sleep.js';
import { toErrorPayload } from '../utils/error.js';
import { createExecutionId } from '../utils/id.js';
import { assertSafeContext } from '../utils/object.js';

export interface EngineDependencies<TContext> {
  storage: StorageAdapter<TContext>;
  shutdownManager?: ShutdownManager;
  config?: EngineConfig;
}

export interface ExecuteInput<TContext> {
  workflowName: string;
  steps: Array<InternalStep<TContext>>;
  context: TContext;
  options?: WorkflowRunOptions;
  resumeExecutionId?: string;
}

export class FlowEngine<TContext extends Record<string, unknown>> {
  private readonly storage: StorageAdapter<TContext>;
  private readonly config: ResolvedConfig;
  private readonly logger: LoggerHooks;
  private readonly shutdownManager: ShutdownManager;
  private readonly activeExecutions = new Set<string>();
  private readonly eventBus = new TypedEventBus<WorkflowEventMap<TContext>>();

  public constructor(deps: EngineDependencies<TContext>) {
    this.storage = deps.storage;
    this.config = resolveConfig(deps.config);
    this.logger = deps.config?.logger ?? noopLogger;
    this.shutdownManager = deps.shutdownManager ?? new ShutdownManager();
  }

  public on<K extends keyof WorkflowEventMap<TContext>>(
    event: K,
    listener: (payload: WorkflowEventMap<TContext>[K]) => void,
  ): () => void {
    return this.eventBus.on(event, listener);
  }

  public shutdown(reason = 'shutdown'): void {
    this.shutdownManager.triggerShutdown(reason);
    this.eventBus.removeAll();
  }

  public async execute(input: ExecuteInput<TContext>): Promise<TContext> {
    assertSafeContext(input.context);

    const executionId = input.resumeExecutionId ?? input.options?.executionId ?? createExecutionId(input.workflowName);
    if (this.activeExecutions.has(executionId)) {
      throw new ValidationError('Execution ID is already running', { executionId });
    }

    const rootController = new AbortController();
    const unlistenShutdown = this.shutdownManager.onShutdown((reason) => {
      rootController.abort(new Error(`Workflow aborted due to ${reason}`));
    });

    const unlistenParentAbort = this.bindParentSignal(input.options?.signal, rootController);
    const timeoutTimer = this.bindWorkflowTimeout(input.options?.timeout, rootController);

    this.activeExecutions.add(executionId);

    const record = await this.getOrCreateRecord(input, executionId);
    record.status = 'running';
    record.updatedAt = this.config.now();
    await this.storage.updateWorkflow(record);

    this.eventBus.emit('workflowStarted', {
      executionId,
      name: input.workflowName,
      context: input.context,
    });

    try {
      for (let index = record.currentIndex; index < input.steps.length; index += 1) {
        rootController.signal.throwIfAborted();
        const step = input.steps[index];
        if (!step) {
          break;
        }

        this.eventBus.emit('stepStarted', {
          executionId,
          workflow: input.workflowName,
          step: step.name,
          index,
        });

        const stepContext: WorkflowContext<TContext> = {
          executionId,
          workflowName: input.workflowName,
          stepName: step.name,
          signal: rootController.signal,
          emit: (event, payload) => this.eventBus.emit(event, payload),
          logger: this.logger,
          context: input.context,
        };

        const retries = step.retries ?? this.config.retry.retries;
        await runWithRetry(
          step.name,
          async () => {
            await this.executeStep(step, stepContext);
          },
          {
            retries,
            backoffMs: this.config.retry.backoffMs,
            maxBackoffMs: this.config.retry.maxBackoffMs,
            jitter: this.config.retry.jitter,
            retryable: step.retryable,
          },
          this.logger,
          rootController.signal,
        );

        this.eventBus.emit('stepCompleted', {
          executionId,
          workflow: input.workflowName,
          step: step.name,
          index,
        });

        record.currentIndex = index + 1;
        record.updatedAt = this.config.now();
        await this.storage.updateWorkflow(record);
      }

      record.status = 'completed';
      record.updatedAt = this.config.now();
      await this.storage.updateWorkflow(record);
      await this.storage.markDone(executionId);

      this.eventBus.emit('workflowCompleted', {
        executionId,
        name: input.workflowName,
        context: input.context,
      });

      return input.context;
    } catch (error) {
      const aborted = rootController.signal.aborted;
      const payload = toErrorPayload(error);

      record.status = aborted ? 'cancelled' : 'failed';
      record.error = payload;
      record.updatedAt = this.config.now();
      await this.storage.updateWorkflow(record);

      if (aborted) {
        this.eventBus.emit('workflowCancelled', {
          executionId,
          name: input.workflowName,
        });
      } else {
        this.eventBus.emit('workflowFailed', {
          executionId,
          name: input.workflowName,
          error: payload,
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutTimer);
      unlistenShutdown();
      unlistenParentAbort();
      this.activeExecutions.delete(executionId);
    }
  }

  private async executeStep(step: InternalStep<TContext>, ctx: WorkflowContext<TContext>): Promise<void> {
    if (step.timeout !== undefined) {
      await withTimeout(step.name, step.timeout, ctx.signal, async () => {
        await step.run(ctx);
      });
      return;
    }

    await step.run(ctx);
  }

  public createSequentialStep(name: string, handler: StepHandler<TContext>, options?: StepOptions): InternalStep<TContext> {
    return {
      type: 'step',
      name,
      retries: options?.retries,
      timeout: options?.timeout,
      retryable: options?.retryable,
      run: async (ctx) => {
        await handler(ctx);
      },
    };
  }

  public createParallelStep(name: string, handlers: Array<StepHandler<TContext>>): InternalStep<TContext> {
    return {
      type: 'parallel',
      name,
      run: async (ctx) => {
        const concurrency = this.config.limits.maxParallel;
        const pending = [...handlers];

        const workers: Array<Promise<void>> = [];
        for (let i = 0; i < Math.min(concurrency, pending.length); i += 1) {
          workers.push(
            (async () => {
              while (pending.length > 0) {
                const current = pending.shift();
                if (!current) {
                  break;
                }
                await current(ctx);
              }
            })(),
          );
        }

        await Promise.all(workers);
      },
    };
  }

  public createDelayStep(name: string, ms: number): InternalStep<TContext> {
    return {
      type: 'delay',
      name,
      run: async (ctx) => {
        await sleep(ms, ctx.signal);
      },
    };
  }

  private bindParentSignal(signal: AbortSignal | undefined, controller: AbortController): () => void {
    if (!signal) {
      return () => undefined;
    }

    const onAbort = () => {
      controller.abort(signal.reason ?? new Error('Workflow aborted by parent signal'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  }

  private bindWorkflowTimeout(timeout: number | undefined, controller: AbortController): ReturnType<typeof setTimeout> {
    const timeoutMs = timeout ?? this.config.limits.maxWorkflowTimeoutMs;

    return setTimeout(() => {
      controller.abort(new Error(`Workflow timeout exceeded: ${timeoutMs}ms`));
    }, timeoutMs);
  }

  private async getOrCreateRecord(
    input: ExecuteInput<TContext>,
    executionId: string,
  ): Promise<WorkflowRecord<TContext>> {
    if (input.resumeExecutionId) {
      const existing = await this.storage.loadWorkflow(executionId);
      if (!existing) {
        throw new ValidationError('Cannot resume workflow; record not found', { executionId });
      }

      if (existing.status !== 'failed' && existing.status !== 'cancelled') {
        throw new ValidationError('Only failed/cancelled workflows can be resumed', { executionId, status: existing.status });
      }

      return {
        ...existing,
        status: 'pending',
        context: input.context,
      };
    }

    const now = this.config.now();
    const record: WorkflowRecord<TContext> = {
      executionId,
      name: input.workflowName,
      status: 'pending',
      context: input.context,
      currentIndex: 0,
      startedAt: now,
      updatedAt: now,
    };

    await this.storage.saveWorkflow(record);
    return record;
  }
}
