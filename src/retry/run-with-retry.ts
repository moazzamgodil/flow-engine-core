import { RetryLimitExceededError } from '../errors/retry-limit-exceeded-error.js';
import type { LoggerHooks, RetryOptions } from '../types/index.js';
import { sleep } from '../delay/sleep.js';
import { randomIntInclusive } from '../utils/runtime-crypto.js';

function computeBackoff(attempt: number, options: RetryOptions): number {
  const exponential = options.backoffMs * 2 ** (attempt - 1);
  const capped = Math.min(exponential, options.maxBackoffMs);
  const jitterRange = Math.floor(capped * options.jitter);

  if (jitterRange <= 0) {
    return capped;
  }

  const jitter = randomIntInclusive(0, jitterRange);
  return capped + jitter;
}

export async function runWithRetry(
  stepName: string,
  operation: () => Promise<void>,
  options: RetryOptions,
  logger?: LoggerHooks,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 1; attempt <= options.retries + 1; attempt += 1) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Workflow aborted');
    }

    try {
      await operation();
      return;
    } catch (error) {
      const canRetry = attempt <= options.retries && (options.retryable ? options.retryable(error) : true);

      if (!canRetry) {
        if (attempt > options.retries) {
          throw new RetryLimitExceededError(stepName, options.retries, error);
        }

        throw error;
      }

      const waitMs = computeBackoff(attempt, options);
      logger?.warn?.('step.retry', { stepName, attempt, waitMs });
      await sleep(waitMs, signal);
    }
  }
}
