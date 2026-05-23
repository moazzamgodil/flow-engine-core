import { StepTimeoutError } from '../errors/step-timeout-error.js';

export async function withTimeout(
  stepName: string,
  timeoutMs: number,
  signal: AbortSignal,
  operation: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  if (timeoutMs <= 0) {
    throw new StepTimeoutError(stepName, timeoutMs);
  }

  const timeoutController = new AbortController();
  const composite = AbortSignal.any([signal, timeoutController.signal]);
  const timeoutError = new StepTimeoutError(stepName, timeoutMs);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timeoutController.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    await Promise.race([operation(composite), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
