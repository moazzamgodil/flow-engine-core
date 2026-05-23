export class WorkflowError extends Error {
  public readonly code: string;
  public readonly metadata?: Record<string, string | number | boolean | null>;

  public constructor(
    message: string,
    code = 'WORKFLOW_ERROR',
    metadata?: Record<string, string | number | boolean | null>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorkflowError';
    this.code = code;
    this.metadata = metadata;
  }
}
