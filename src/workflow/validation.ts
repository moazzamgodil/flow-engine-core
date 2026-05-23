import { ValidationError } from '../errors/validation-error.js';
import type { InternalStep, StepHandler, StepOptions, WorkflowLimits } from '../types/index.js';

export function validateWorkflowName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('Workflow name must be non-empty');
  }

  if (name.length > 128) {
    throw new ValidationError('Workflow name too long');
  }
}

export function validateStepName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new ValidationError('Step name must be non-empty');
  }
}

export function validateStepOptions(options?: StepOptions): void {
  if (!options) {
    return;
  }

  if (options.retries !== undefined && (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 20)) {
    throw new ValidationError('Invalid retries value');
  }

  if (options.timeout !== undefined && (!Number.isInteger(options.timeout) || options.timeout <= 0 || options.timeout > 60_000)) {
    throw new ValidationError('Invalid timeout value');
  }
}

export function validateParallelHandlers<TContext>(handlers: Array<StepHandler<TContext>>, limits: WorkflowLimits): void {
  if (handlers.length === 0) {
    throw new ValidationError('Parallel handlers cannot be empty');
  }

  if (handlers.length > limits.maxParallel) {
    throw new ValidationError('Parallel handlers exceed maxParallel limit');
  }
}

export function validateStepCount<TContext>(steps: Array<InternalStep<TContext>>, limits: WorkflowLimits): void {
  if (steps.length > limits.maxSteps) {
    throw new ValidationError('Workflow exceeds maxSteps limit');
  }
}
