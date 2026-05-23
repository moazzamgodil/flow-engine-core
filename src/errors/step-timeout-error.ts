import { WorkflowError } from './workflow-error.js';

export class StepTimeoutError extends WorkflowError {
  public constructor(stepName: string, timeoutMs: number) {
    super(`Step '${stepName}' timed out after ${timeoutMs}ms`, 'STEP_TIMEOUT', {
      stepName,
      timeoutMs,
    });
    this.name = 'StepTimeoutError';
  }
}
