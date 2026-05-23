import { describe, expect, it, vi } from 'vitest';

import { InMemoryStorageAdapter, ValidationError, createRuntime, workflow } from '../src/index.js';
import { parseDelay } from '../src/delay/parse-delay.js';

describe('delay parser', () => {
  it('parses supported units', () => {
    expect(parseDelay('500ms')).toBe(500);
    expect(parseDelay('5s')).toBe(5000);
    expect(parseDelay('10m')).toBe(600000);
    expect(parseDelay('1h')).toBe(3600000);
  });

  it('rejects invalid format', () => {
    expect(() => parseDelay('5d')).toThrow(ValidationError);
  });
});

describe('workflow engine', () => {
  it('runs sequential steps', async () => {
    const calls: string[] = [];

    await workflow<{ value: number }>('sequential')
      .step('a', ({ context }) => {
        context.value += 1;
        calls.push('a');
      })
      .step('b', ({ context }) => {
        context.value += 2;
        calls.push('b');
      })
      .run({ value: 1 });

    expect(calls).toEqual(['a', 'b']);
  });

  it('runs parallel handlers', async () => {
    const tracker = new Set<number>();

    await workflow<{ ok: boolean }>('parallel')
      .parallel([
        () => {
          tracker.add(1);
        },
        () => {
          tracker.add(2);
        },
      ])
      .run({ ok: true });

    expect(tracker.size).toBe(2);
  });

  it('retries failed step and succeeds', async () => {
    let attempts = 0;

    await workflow<{ done: boolean }>('retry-success')
      .step(
        'unstable',
        () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error('fail');
          }
        },
        { retries: 3 },
      )
      .run({ done: false });

    expect(attempts).toBe(3);
  });

  it('supports delay execution', async () => {
    const start = Date.now();
    await workflow<{ ok: boolean }>('delay').delay('10ms').run({ ok: true });
    expect(Date.now() - start).toBeGreaterThanOrEqual(8);
  });

  it('supports timeout handling', async () => {
    await expect(
      workflow<{ ok: boolean }>('timeout')
        .step(
          'slow',
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
          },
          { timeout: 10 },
        )
        .run({ ok: true }),
    ).rejects.toThrow();
  });

  it('supports cancellation via AbortController', async () => {
    const controller = new AbortController();

    const promise = workflow<{ ok: boolean }>('cancel')
      .step('wait', async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      })
      .run({ ok: true }, { signal: controller.signal });

    controller.abort(new Error('cancelled'));

    await expect(promise).rejects.toThrow();
  });

  it('persists and resumes failed workflow', async () => {
    const storage = new InMemoryStorageAdapter<{ count: number }>();
    const runtime = createRuntime<{ count: number }>({ storage });

    let first = true;
    const builder = runtime
      .workflow('resume-flow')
      .step('one', ({ context }) => {
        context.count += 1;
      })
      .step('two', () => {
        if (first) {
          first = false;
          throw new Error('transient');
        }
      })
      .step('three', ({ context }) => {
        context.count += 1;
      });

    await expect(builder.run({ count: 0 }, { executionId: 'x-1' })).rejects.toThrow();

    const stored = await storage.loadWorkflow('x-1');
    expect(stored?.status).toBe('failed');

    const result = await builder.resume('x-1', { count: stored?.context.count ?? 0 });
    expect(result.count).toBe(2);
  });

  it('prevents duplicate execution IDs', async () => {
    const runtime = createRuntime<{ value: number }>();

    const wf = runtime.workflow('dup').step('a', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const first = wf.run({ value: 1 }, { executionId: 'same' });
    const second = wf.run({ value: 1 }, { executionId: 'same' });

    await expect(second).rejects.toThrow(ValidationError);
    await first;
  });

  it('validates workflow definitions', () => {
    expect(() => workflow('invalid').parallel([])).toThrow(ValidationError);
    expect(() => workflow('invalid').delay('abc')).toThrow(ValidationError);
  });

  it('handles event hooks', async () => {
    const runtime = createRuntime<{ v: number }>();
    const started = vi.fn();
    const unsubscribe = runtime.on('workflowStarted', started);

    await runtime.workflow('events').step('a', () => {}).run({ v: 1 });

    expect(started).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('supports graceful shutdown', async () => {
    const runtime = createRuntime<{ ok: boolean }>();

    const p = runtime
      .workflow('shutdown')
      .step('wait', async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      })
      .run({ ok: true });

    runtime.shutdown('test');

    await expect(p).rejects.toThrow();
  });
});
