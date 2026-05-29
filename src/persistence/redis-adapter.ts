import type { StorageAdapter, WorkflowRecord } from '../types/index.js';
import { PersistenceError } from '../errors/persistence-error.js';

export interface RedisLikeClient {
  set: (
    key: string,
    value: string,
    options?: { nx?: boolean; xx?: boolean; NX?: boolean; XX?: boolean },
  ) => Promise<string | null>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<number>;
}

export interface RedisStorageAdapterOptions {
  keyPrefix?: string;
}

function toKey(executionId: string, keyPrefix: string): string {
  return `${keyPrefix}${executionId}`;
}

function parseRecord<TContext>(value: string): WorkflowRecord<TContext> {
  return JSON.parse(value) as WorkflowRecord<TContext>;
}

export class RedisStorageAdapter<TContext> implements StorageAdapter<TContext> {
  private readonly keyPrefix: string;

  public constructor(
    private readonly client: RedisLikeClient,
    options: RedisStorageAdapterOptions = {},
  ) {
    this.keyPrefix = options.keyPrefix ?? 'flow-engine:workflow:';
  }

  public async saveWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    const result = await this.client.set(toKey(record.executionId, this.keyPrefix), JSON.stringify(record), {
      nx: true,
    });
    if (result === null) {
      throw new PersistenceError('Execution ID already exists');
    }
  }

  public async loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null> {
    const data = await this.client.get(toKey(executionId, this.keyPrefix));
    return data ? parseRecord<TContext>(data) : null;
  }

  public async updateWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    const result = await this.client.set(toKey(record.executionId, this.keyPrefix), JSON.stringify(record), {
      xx: true,
    });
    if (result === null) {
      throw new PersistenceError('Workflow record does not exist');
    }
  }

  public async markDone(executionId: string): Promise<void> {
    await this.client.del(toKey(executionId, this.keyPrefix));
  }
}
