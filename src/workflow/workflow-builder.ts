import type { FlowEngine } from '../core/engine.js';
import { parseDelay } from '../delay/parse-delay.js';
import { ValidationError } from '../errors/validation-error.js';
import type { InternalStep, StepHandler, StepOptions, WorkflowRunOptions } from '../types/index.js';
import {
  validateParallelHandlers,
  validateStepCount,
  validateStepName,
  validateStepOptions,
  validateWorkflowName,
} from './validation.js';

export class WorkflowBuilder<TContext extends Record<string, unknown>> {
  private readonly steps: Array<InternalStep<TContext>> = [];

  public constructor(
    private readonly name: string,
    private readonly engine: FlowEngine<TContext>,
    private readonly limits: { maxSteps: number; maxParallel: number },
  ) {
    validateWorkflowName(name);
  }

  public step(name: string, handler: StepHandler<TContext>, options?: StepOptions): this {
    validateStepName(name);
    validateStepOptions(options);

    this.steps.push(this.engine.createSequentialStep(name, handler, options));
    this.validateShape();
    return this;
  }

  public parallel(handlers: Array<StepHandler<TContext>>, name = 'parallel'): this {
    validateParallelHandlers(handlers, {
      maxSteps: this.limits.maxSteps,
      maxParallel: this.limits.maxParallel,
      maxWorkflowTimeoutMs: Number.MAX_SAFE_INTEGER,
    });

    this.steps.push(this.engine.createParallelStep(name, handlers));
    this.validateShape();
    return this;
  }

  public delay(duration: string, name = 'delay'): this {
    const ms = parseDelay(duration);
    this.steps.push(this.engine.createDelayStep(name, ms));
    this.validateShape();
    return this;
  }

  public async run(context: TContext, options?: WorkflowRunOptions): Promise<TContext> {
    if (this.steps.length === 0) {
      throw new ValidationError('Workflow requires at least one step');
    }

    return this.engine.execute({
      workflowName: this.name,
      steps: [...this.steps],
      context,
      options,
    });
  }

  public async resume(executionId: string, context: TContext, options?: Omit<WorkflowRunOptions, 'executionId'>): Promise<TContext> {
    if (!executionId) {
      throw new ValidationError('Execution ID is required for resume');
    }

    return this.engine.execute({
      workflowName: this.name,
      steps: [...this.steps],
      context,
      options,
      resumeExecutionId: executionId,
    });
  }

  private validateShape(): void {
    validateStepCount(this.steps, {
      maxSteps: this.limits.maxSteps,
      maxParallel: this.limits.maxParallel,
      maxWorkflowTimeoutMs: Number.MAX_SAFE_INTEGER,
    });
  }
}
