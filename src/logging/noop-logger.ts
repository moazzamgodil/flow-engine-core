import type { LoggerHooks } from '../types/index.js';

export const noopLogger: LoggerHooks = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
