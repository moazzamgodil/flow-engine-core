# Flow Engine Core

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
![ES Version][es-version]
![Node Version][node-version]

[npm-img]: https://img.shields.io/npm/v/flow-engine-core/latest
[npm-url]: https://www.npmjs.com/package/flow-engine-core
[downloads-img]: https://img.shields.io/npm/dt/flow-engine-core
[downloads-url]: https://www.npmtrends.com/flow-engine-core
[issues-img]: https://img.shields.io/github/issues/moazzamgodil/flow-engine-core
[issues-url]: https://github.com/moazzamgodil/flow-engine-core/issues
[es-version]: https://img.shields.io/badge/ES-2020-yellow
[node-version]: https://img.shields.io/badge/node-20.x-green

A lightweight, security-focused, event-driven workflow engine for Node.js and browsers.

## Installation

```bash
npm install flow-engine-core
```

## Requirements

- Node.js `>=20` (for Node runtimes)
- Web Crypto support (`globalThis.crypto`) in your runtime

## Quick Start

```ts
import { workflow } from 'flow-engine-core';

interface SignupContext {
  email: string;
  userId?: string;
  welcomeSent: boolean;
}

let attempts = 0;

const result = await workflow<SignupContext>('user-signup')
  .step('create-user', ({ context }) => {
    context.userId = `u_${Math.floor(Math.random() * 10000)}`;
  })
  .step(
    'send-email',
    async ({ context }) => {
      attempts += 1;
      if (attempts < 2) throw new Error('SMTP temporary failure');
      context.welcomeSent = true;
    },
    { retries: 3, timeout: 5000 },
  )
  .run({
    email: 'user@example.com',
    welcomeSent: false,
  });

console.log(result.executionId);
```

## Module and Runtime Support

- Node ESM:

```ts
import { workflow } from 'flow-engine-core';
```

- Node CommonJS:

```js
const { workflow } = require('flow-engine-core');
```

- Browser ESM via CDN:

```html
<script type="module">
  import { workflow } from 'https://esm.sh/flow-engine-core';
  console.log(typeof workflow);
</script>
```

- Browser global build:

```html
<script src="https://unpkg.com/flow-engine-core/dist/index.global.js"></script>
<script>
  const { workflow } = window.FlowEngine;
  console.log(typeof workflow);
</script>
```

## Core API

Top-level exports:

- `workflow<TContext>(name)`
- `createRuntime<TContext>({ config?, storage? })`
- `onWorkflowEvent(event, listener)`
- `onFlowEvent(flowName, event, listener)`
- `onFlowHooks(flowName, hooks)`
- `shutdown(reason?)`
- `parseDelay(input)`
- `InMemoryStorageAdapter`

Workflow builder methods:

- `.step(name, handler, options?)`
- `.parallel(handlers, name?)`
- `.delay(duration, name?)`
- `.run(context, options?)`
- `.resume(executionId, context, options?)`

Step options:

- `retries?: number`
- `timeout?: number`
- `retryable?: (error) => boolean`

Run options:

- `executionId?: string`
- `signal?: AbortSignal`
- `timeout?: number`

## Runtime API

Use `createRuntime` when you want shared config, storage, and event listeners.

```ts
import { createRuntime, InMemoryStorageAdapter } from 'flow-engine-core';

interface Ctx {
  id: string;
  processed: boolean;
}

const runtime = createRuntime<Ctx>({
  storage: new InMemoryStorageAdapter<Ctx>(),
  config: {
    retry: {
      retries: 2,
      backoffMs: 100,
      maxBackoffMs: 1000,
      jitter: 0.2,
    },
  },
});

runtime.on('workflowCompleted', (e) => {
  console.log('done', e.executionId);
});

await runtime
  .workflow('demo')
  .step('process', ({ context }) => {
    context.processed = true;
  })
  .run({ id: '1', processed: false });
```

## Cancellation with AbortController

```ts
import { workflow } from 'flow-engine-core';

const controller = new AbortController();

const runPromise = workflow('cancellable-flow')
  .step('long-task', async ({ signal }) => {
    signal.throwIfAborted();
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    signal.throwIfAborted();
  })
  .run({ ok: true }, { signal: controller.signal });

setTimeout(() => {
  controller.abort(new Error('Cancelled by user'));
}, 100);

await runPromise;
```

## Persistence

Built-in adapter:

- `InMemoryStorageAdapter`

Adapter contract:

```ts
interface StorageAdapter<TContext> {
  saveWorkflow(record: WorkflowRecord<TContext>): Promise<void>;
  loadWorkflow(executionId: string): Promise<WorkflowRecord<TContext> | null>;
  updateWorkflow(record: WorkflowRecord<TContext>): Promise<void>;
  markDone(executionId: string): Promise<void>;
}
```

## Events

Supported events:

- `workflowStarted`
- `workflowCompleted`
- `workflowFailed`
- `workflowCancelled`
- `stepStarted`
- `stepCompleted`
- `stepFailed`

Example:

```ts
import { onFlowEvent, onFlowHooks } from 'flow-engine-core';

const offCompleted = onFlowEvent('user-signup', 'workflowCompleted', (payload) => {
  console.log('signup done', payload.executionId);
});

const offHooks = onFlowHooks('user-signup', {
  failed: (payload) => {
    console.error('signup failed', payload.error);
  },
  completed: (payload) => {
    console.log('signup completed', payload.executionId);
  },
});

const offAll = onFlowEvent('*', 'workflowFailed', (payload) => {
  console.error('any flow failed', payload.name);
});

offCompleted();
offHooks();
offAll();
```

## Errors

Custom errors:

- `WorkflowError`
- `StepTimeoutError`
- `RetryLimitExceededError`
- `ValidationError`
- `PersistenceError`

## Security Notes

- No `eval` or dynamic `Function` usage
- Context validation blocks unsafe keys
- Delay validation supports `ms`, `s`, `m`, `h`
- Bounded retries with backoff, jitter, and cap
- Per-step and workflow timeout controls
- Cancellation support through `AbortController`

## Troubleshooting

1. `RetryLimitExceededError`
Inspect `error.cause` for the original failure.

2. `Secure crypto API is unavailable in this runtime`
Use a runtime that provides `globalThis.crypto`.

## License

MIT
