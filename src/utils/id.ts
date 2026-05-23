import { randomUuid } from './runtime-crypto.js';

export function createExecutionId(prefix: string): string {
  return `${prefix}:${randomUuid()}`;
}
