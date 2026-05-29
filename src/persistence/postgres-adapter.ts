import type { StorageAdapter, WorkflowErrorPayload, WorkflowRecord } from '../types/index.js';
import { PersistenceError } from '../errors/persistence-error.js';

export interface PostgresQueryResult {
  rowCount: number | null;
  rows: unknown[];
}

export interface PostgresLikeClient {
  query: (sql: string, params?: readonly unknown[]) => Promise<PostgresQueryResult>;
}

export interface PostgresStorageAdapterOptions {
  tableName?: string;
  schemaName?: string;
}

interface PostgresWorkflowRow<TContext> {
  execution_id: string;
  name: string;
  status: WorkflowRecord<TContext>['status'];
  context_json: TContext;
  current_index: number;
  updated_at: number;
  started_at: number;
  error_json: WorkflowErrorPayload | null;
}

function quoteIdentifier(input: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input)) {
    throw new PersistenceError(`Invalid SQL identifier: ${input}`);
  }
  return `"${input}"`;
}

function mapRowToRecord<TContext>(row: PostgresWorkflowRow<TContext>): WorkflowRecord<TContext> {
  return {
    executionId: row.execution_id,
    name: row.name,
    status: row.status,
    context: row.context_json,
    currentIndex: row.current_index,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    ...(row.error_json ? { error: row.error_json } : {}),
  };
}

export class PostgresStorageAdapter<TContext> implements StorageAdapter<TContext> {
  private initialized = false;
  private readonly tableName: string;
  private readonly schemaName: string;

  public constructor(
    private readonly client: PostgresLikeClient,
    options: PostgresStorageAdapterOptions = {},
  ) {
    this.tableName = options.tableName ?? 'flow_workflows';
    this.schemaName = options.schemaName ?? 'public';
  }

  private async ensureTable(): Promise<void> {
    if (this.initialized) return;

    const qualifiedTable = `${quoteIdentifier(this.schemaName)}.${quoteIdentifier(this.tableName)}`;
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
        execution_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        context_json JSONB NOT NULL,
        current_index INTEGER NOT NULL,
        updated_at BIGINT NOT NULL,
        started_at BIGINT NOT NULL,
        error_json JSONB NULL
      )`,
    );
    this.initialized = true;
  }

  public async saveWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    await this.ensureTable();
    const qualifiedTable = `${quoteIdentifier(this.schemaName)}.${quoteIdentifier(this.tableName)}`;
    const result = await this.client.query(
      `INSERT INTO ${qualifiedTable}
        (execution_id, name, status, context_json, current_index, updated_at, started_at, error_json)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)
       ON CONFLICT (execution_id) DO NOTHING`,
      [
        record.executionId,
        record.name,
        record.status,
        JSON.stringify(record.context),
        record.currentIndex,
        record.updatedAt,
        record.startedAt,
        record.error ? JSON.stringify(record.error) : null,
      ],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new PersistenceError('Execution ID already exists');
    }
  }

  public async loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null> {
    await this.ensureTable();
    const qualifiedTable = `${quoteIdentifier(this.schemaName)}.${quoteIdentifier(this.tableName)}`;
    const result = await this.client.query(
      `SELECT execution_id, name, status, context_json, current_index, updated_at, started_at, error_json
       FROM ${qualifiedTable}
       WHERE execution_id = $1`,
      [executionId],
    );
    const first = result.rows[0];
    if (!first) return null;
    return mapRowToRecord(first as PostgresWorkflowRow<TContext>);
  }

  public async updateWorkflow(record: WorkflowRecord<TContext>): Promise<void> {
    await this.ensureTable();
    const qualifiedTable = `${quoteIdentifier(this.schemaName)}.${quoteIdentifier(this.tableName)}`;
    const result = await this.client.query(
      `UPDATE ${qualifiedTable}
       SET name = $2,
           status = $3,
           context_json = $4::jsonb,
           current_index = $5,
           updated_at = $6,
           started_at = $7,
           error_json = $8::jsonb
       WHERE execution_id = $1`,
      [
        record.executionId,
        record.name,
        record.status,
        JSON.stringify(record.context),
        record.currentIndex,
        record.updatedAt,
        record.startedAt,
        record.error ? JSON.stringify(record.error) : null,
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new PersistenceError('Workflow record does not exist');
    }
  }

  public async markDone(executionId: string): Promise<void> {
    await this.ensureTable();
    const qualifiedTable = `${quoteIdentifier(this.schemaName)}.${quoteIdentifier(this.tableName)}`;
    await this.client.query(`DELETE FROM ${qualifiedTable} WHERE execution_id = $1`, [executionId]);
  }
}
