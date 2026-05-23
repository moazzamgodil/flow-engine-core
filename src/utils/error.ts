import type { WorkflowErrorPayload } from '../types/index.js';
import { WorkflowError } from '../errors/workflow-error.js';

export function toErrorPayload(error: unknown): WorkflowErrorPayload {
  if (error instanceof WorkflowError) {
    return {
      code: error.code,
      message: error.message,
      metadata: error.metadata,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'UNHANDLED_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Unknown error occurred',
  };
}
