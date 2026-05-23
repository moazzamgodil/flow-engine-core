import { WorkflowError } from './workflow-error.js';

export class PersistenceError extends WorkflowError {
  public constructor(message: string, cause?: unknown) {
    super(message, 'PERSISTENCE_ERROR', undefined, { cause });
    this.name = 'PersistenceError';
  }
}
