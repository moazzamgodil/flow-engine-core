import { WorkflowError } from './workflow-error.js';

export class ValidationError extends WorkflowError {
  public constructor(message: string, metadata?: Record<string, string | number | boolean | null>) {
    super(message, 'VALIDATION_ERROR', metadata);
    this.name = 'ValidationError';
  }
}
