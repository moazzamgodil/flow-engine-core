import { ValidationError } from '../errors/validation-error.js';

const DELAY_REGEX = /^(\d+)(ms|s|m|h)$/;

const UNIT_TO_MS: Record<'ms' | 's' | 'm' | 'h', number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

export function parseDelay(input: string): number {
  const value = input.trim();
  const match = DELAY_REGEX.exec(value);

  if (!match) {
    throw new ValidationError('Invalid delay format', { value });
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof UNIT_TO_MS;

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new ValidationError('Invalid delay amount', { value });
  }

  const result = amount * UNIT_TO_MS[unit];
  if (!Number.isSafeInteger(result)) {
    throw new ValidationError('Delay value overflow', { value });
  }

  return result;
}
