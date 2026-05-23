import { ValidationError } from '../errors/validation-error.js';

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function assertSafeContext(value: unknown): void {
  if (!isPlainObject(value)) {
    throw new ValidationError('Workflow context must be a plain object');
  }

  const hasForbiddenKey =
    Object.prototype.hasOwnProperty.call(value, '__proto__') ||
    Object.prototype.hasOwnProperty.call(value, 'prototype') ||
    Object.prototype.hasOwnProperty.call(value, 'constructor');

  if (hasForbiddenKey) {
    throw new ValidationError('Context contains forbidden keys');
  }
}
