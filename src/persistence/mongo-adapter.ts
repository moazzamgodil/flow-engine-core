import type { StorageAdapter, WorkflowRecord } from '../types/index.js';
import { PersistenceError } from '../errors/persistence-error.js';

export interface MongoInsertOneResult {
  acknowledged: boolean;
}

export interface MongoReplaceOneResult {
  matchedCount: number;
}

export interface MongoCollectionLike<TDocument> {
  createIndex: (index: Record<string, 1 | -1>, options?: { unique?: boolean }) => Promise<string>;
  insertOne: (doc: TDocument) => Promise<MongoInsertOneResult>;
  findOne: (filter: Record<string, unknown>) => Promise<TDocument | null>;
  replaceOne: (filter: Record<string, unknown>, replacement: TDocument) => Promise<MongoReplaceOneResult>;
  deleteOne: (filter: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
}

export interface MongoDbLike {
  collection: <TDocument>(name: string) => MongoCollectionLike<TDocument>;
}

export interface MongoStorageAdapterOptions {
  collectionName?: string;
}

interface MongoWorkflowDocument<TContext> extends WorkflowRecord<TContext> {
  _id: string;
}

function toDocument<TContext>(record: WorkflowRecord<TContext>): MongoWorkflowDocument<TContext> {
  return { _id: record.executionId, ...record };
}

function toRecord<TContext>(doc: MongoWorkflowDocument<TContext>): WorkflowRecord<TContext> {
  const record = { ...doc };
  delete (record as { _id?: string })._id;
  return record;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === 11000;
}

export class MongoStorageAdapter<TContext> implements StorageAdapter<TContext> {
  private readonly collectionName: string;
  private indexReady = false;

  public constructor(
    private readonly db: MongoDbLike,
    options: MongoStorageAdapterOptions = {},
  ) {
    this.collectionName = options.collectionName ?? 'flow_workflows';
  }

  private get collection(): MongoCollectionLike<MongoWorkflowDocument<TContext>> {
    return this.db.collection<MongoWorkflowDocument<TContext>>(this.collectionName);
  }

  private async ensureIndexes(): Promise<void> {
    if (this.indexReady) return;
    await this.collection.createIndex({ _id: 1 }, { unique: true });
    this.indexReady = true;
  }

  public async saveWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    await this.ensureIndexes();
    try {
      await this.collection.insertOne(toDocument(record));
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new PersistenceError('Execution ID already exists');
      }
      throw error;
    }
  }

  public async loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null> {
    const doc = await this.collection.findOne({ _id: executionId });
    return doc ? toRecord(doc) : null;
  }

  public async updateWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    const result = await this.collection.replaceOne({ _id: record.executionId }, toDocument(record));
    if (result.matchedCount === 0) {
      throw new PersistenceError('Workflow record does not exist');
    }
  }

  public async markDone(executionId: string): Promise<void> {
    await this.collection.deleteOne({ _id: executionId });
  }
}
