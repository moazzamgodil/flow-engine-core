import { WorkflowError } from './workflow-error.js';

export class RetryLimitExceededError extends WorkflowError {
  public constructor(stepName: string, retries: number, cause?: unknown) {
    super(`Retry limit exceeded for step '${stepName}'`, 'RETRY_LIMIT_EXCEEDED', { stepName, retries }, { cause });
    this.name = 'RetryLimitExceededError';
  }
}
