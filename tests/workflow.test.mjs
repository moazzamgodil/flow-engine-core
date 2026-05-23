import assert from 'node:assert/strict';

import { InMemoryStorageAdapter, ValidationError, createRuntime, workflow, parseDelay, onFlowEvent, onFlowHooks } from '../dist/index.js';

const cases = [];
const add = (name, run) => cases.push({ name, run });

add('delay parser works', () => {
  assert.equal(parseDelay('500ms'), 500);
  assert.equal(parseDelay('5s'), 5000);
  assert.equal(parseDelay('10m'), 600000);
  assert.equal(parseDelay('1h'), 3600000);
  assert.throws(() => parseDelay('5d'), ValidationError);
});

add('sequential steps execute in order', async () => {
  const calls = [];
  await workflow('sequential')
    .step('a', ({ context }) => {
      context.value += 1;
      calls.push('a');
    })
    .step('b', ({ context }) => {
      context.value += 2;
      calls.push('b');
    })
    .run({ value: 1 });
  assert.deepEqual(calls, ['a', 'b']);
});

add('parallel steps execute', async () => {
  const tracker = new Set();
  await workflow('parallel').parallel([() => tracker.add(1), () => tracker.add(2)]).run({ ok: true });
  assert.equal(tracker.size, 2);
});

add('retry succeeds', async () => {
  let attempts = 0;
  await workflow('retry-success')
    .step('unstable', () => {
      attempts += 1;
      if (attempts < 3) throw new Error('fail');
    }, { retries: 3 })
    .run({ done: false });
  assert.equal(attempts, 3);
});

add('delay executes', async () => {
  const start = Date.now();
  await workflow('delay').delay('10ms').run({ ok: true });
  assert.ok(Date.now() - start >= 8);
});

add('timeout handling', async () => {
  await assert.rejects(
    workflow('timeout')
      .step('slow', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }, { timeout: 10 })
      .run({ ok: true }),
  );
});

add('cancellation handling', async () => {
  const controller = new AbortController();
  const promise = workflow('cancel')
    .step('wait', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    })
    .run({ ok: true }, { signal: controller.signal });
  controller.abort(new Error('cancelled'));
  await assert.rejects(promise);
});

add('resume failed workflow', async () => {
  const storage = new InMemoryStorageAdapter();
  const runtime = createRuntime({ storage });
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

  await assert.rejects(builder.run({ count: 0 }, { executionId: 'x-1' }));
  const stored = await storage.loadWorkflow('x-1');
  assert.equal(stored?.status, 'failed');
  const result = await builder.resume('x-1', { count: stored?.context.count ?? 0 });
  assert.equal(result.count, 2);
});

add('duplicate execution IDs are blocked', async () => {
  const runtime = createRuntime();
  const wf = runtime.workflow('dup').step('a', async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  const first = wf.run({ value: 1 }, { executionId: 'same' });
  const second = wf.run({ value: 1 }, { executionId: 'same' });
  await assert.rejects(second, ValidationError);
  await first;
});

add('invalid workflow definitions are rejected', () => {
  assert.throws(() => workflow('invalid').parallel([]), ValidationError);
  assert.throws(() => workflow('invalid').delay('abc'), ValidationError);
});

add('event hooks fire', async () => {
  const runtime = createRuntime();
  let count = 0;
  const unsubscribe = runtime.on('workflowStarted', () => {
    count += 1;
  });

  await runtime.workflow('events').step('a', () => {}).run({ v: 1 });
  assert.equal(count, 1);
  unsubscribe();
});

add('flow-name event hook works across runtimes', async () => {
  const runtime = createRuntime();
  let completed = 0;
  const off = onFlowEvent('billing-sync', 'workflowCompleted', () => {
    completed += 1;
  });

  await runtime.workflow('billing-sync').step('a', () => {}).run({ ok: true });
  await runtime.workflow('other-flow').step('a', () => {}).run({ ok: true });
  off();

  assert.equal(completed, 1);
});

add('flow hooks support failed/completed listeners', async () => {
  let failed = 0;
  let completed = 0;
  const off = onFlowHooks('checkout', {
    failed: () => {
      failed += 1;
    },
    completed: () => {
      completed += 1;
    },
  });

  await assert.rejects(
    workflow('checkout')
      .step('boom', () => {
        throw new Error('boom');
      })
      .run({ ok: true }),
  );

  await workflow('checkout').step('ok', () => {}).run({ ok: true });
  off();

  assert.equal(failed, 1);
  assert.equal(completed, 1);
});

add('graceful shutdown cancels in-flight workflow', async () => {
  const runtime = createRuntime();
  const promise = runtime.workflow('shutdown').step('wait', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }).run({ ok: true });

  runtime.shutdown('test');
  await assert.rejects(promise);
});

let failures = 0;
for (const testCase of cases) {
  try {
    await testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${testCase.name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exitCode = 1;
  throw new Error(`${failures} test case(s) failed`);
}
