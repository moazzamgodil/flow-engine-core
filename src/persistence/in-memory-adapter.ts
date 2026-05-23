import type { StorageAdapter, WorkflowRecord } from '../types/index.js';
import { PersistenceError } from '../errors/persistence-error.js';

function cloneRecord<TContext>(record: WorkflowRecord<TContext>): WorkflowRecord<TContext> {
  return structuredClone(record);
}

export class InMemoryStorageAdapter<TContext> implements StorageAdapter<TContext> {
  private readonly records = new Map<string, WorkflowRecord<TContext>>();

  public saveWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    if (this.records.has(record.executionId)) {
      throw new PersistenceError('Execution ID already exists');
    }

    this.records.set(record.executionId, cloneRecord(record));
    return Promise.resolve();
  }

  public loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null> {
    const record = this.records.get(executionId);
    return Promise.resolve(record ? cloneRecord(record) : null);
  }

  public updateWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    if (!this.records.has(record.executionId)) {
      throw new PersistenceError('Workflow record does not exist');
    }

    this.records.set(record.executionId, cloneRecord(record));
    return Promise.resolve();
  }

  public markDone(executionId: string): Promise<void> {
    this.records.delete(executionId);
    return Promise.resolve();
  }
}
