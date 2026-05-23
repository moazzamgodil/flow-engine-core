# flow-engine-core

A lightweight, security-focused, event-driven workflow engine for Node.js and browsers.

- TypeScript-first
- ESM + CommonJS
- Browser + CDN support
- Node.js >= 20
- Minimal runtime dependencies

## What This Library Does

`flow-engine-core` helps you run backend workflows reliably:

- run sequential and parallel steps
- retry failing steps with backoff
- enforce timeouts
- delay execution
- persist workflow state
- resume failed runs
- cancel gracefully on shutdown

It works in backend/services and browser runtimes.

## Installation

```bash
npm install flow-engine-core
```

## Runtime/Module Support

- Node ESM: `import { workflow } from 'flow-engine-core'`
- Node CommonJS: `const { workflow } = require('flow-engine-core')`
- Browser ESM: `import { workflow } from 'flow-engine-core'` (bundler) or ESM CDN URL
- Browser CDN global: `window.FlowEngine`

CDN examples:

```html
<script type="module">
  import { workflow } from 'https://esm.sh/flow-engine-core';
  console.log(typeof workflow);
</script>
```

```html
<script src="https://unpkg.com/flow-engine-core/dist/index.global.js"></script>
<script>
  const { workflow } = window.FlowEngine;
  console.log(typeof workflow);
</script>
```

## CommonJS Usage (Node)

```js
const { workflow, createRuntime, onFlowEvent } = require('flow-engine-core');

async function main() {
  onFlowEvent('signup', 'workflowCompleted', (payload) => {
    console.log('completed', payload.executionId);
  });

  const result = await workflow('signup')
    .step('create-user', ({ context }) => {
      context.userId = 'u_1';
    })
    .run({ email: 'user@example.com' });

  console.log(result);
}

main().catch(console.error);
```

## Developer Syntax Guide

### 1. Build a workflow

```ts
workflow('flow-name')
  .step('step-name', handler, { retries, timeout, retryable })
  .parallel([handlerA, handlerB], 'parallel-name')
  .delay('5s', 'delay-name')
  .run(context, { executionId, signal, timeout });
```

### 2. Resume a failed/cancelled run

```ts
await workflow('flow-name')
  .step('step-a', ({ context }) => {
    context.done = true;
  })
  .resume('existing-execution-id', { done: false });
```

### 3. Create runtime (recommended for apps)

```ts
const runtime = createRuntime({
  storage: new InMemoryStorageAdapter(),
  config: {
    retry: { retries: 2, backoffMs: 100, maxBackoffMs: 1000, jitter: 0.2 },
  },
});

runtime.on('workflowStarted', (payload) => console.log(payload.name));
runtime.workflow('flow-name').step('a', () => {}).run({ ok: true });
```

### 4. Global hooks by flow name (listen from anywhere)

```ts
const offEvent = onFlowEvent('billing-sync', 'workflowFailed', (payload) => {
  console.error(payload.error);
});

const offHooks = onFlowHooks('billing-sync', {
  completed: (payload) => console.log(payload.executionId),
  failed: (payload) => console.error(payload.error),
});

// Listen for all flows:
const offAll = onFlowEvent('*', 'workflowCompleted', (payload) => {
  console.log(payload.name);
});
```

### 5. Browser CDN usage

```html
<script src="https://unpkg.com/flow-engine-core/dist/index.global.js"></script>
<script>
  const { workflow, onFlowEvent } = window.FlowEngine;
  onFlowEvent('demo', 'workflowCompleted', (payload) => console.log(payload.executionId));
</script>
```

## Supported Functions (API List)

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
- `timeout?: number` (ms)
- `retryable?: (error) => boolean`

Run options:

- `executionId?: string`
- `signal?: AbortSignal`
- `timeout?: number` (workflow-level ms)

## Quick Start

```ts
import { workflow } from 'flow-engine-core';

interface SignupContext {
  email: string;
  userId?: string;
  welcomeSent: boolean;
  analyticsTracked: boolean;
}

let unstableAttempts = 0;

const result = await workflow<SignupContext>('user-signup')
  .step('create-user', ({ context }) => {
    context.userId = `u_${Math.floor(Math.random() * 10000)}`;
  })
  .step(
    'send-email',
    async ({ context }) => {
      unstableAttempts += 1;
      if (unstableAttempts < 2) throw new Error('SMTP temporary failure');
      context.welcomeSent = true;
    },
    { retries: 3, timeout: 5000 },
  )
  .parallel([
    async ({ context }) => {
      context.analyticsTracked = true;
    },
    async () => {
      // another parallel task
    },
  ])
  .delay('5s')
  .run({
    email: 'user@example.com',
    welcomeSent: false,
    analyticsTracked: false,
  });

console.log(result);
```

## Important Concepts

1. Context is your workflow state
- The object you pass to `.run(context)` is shared across all steps.
- Use it to store/update state.

2. Step names are not fixed
- You can use any non-empty string name.
- Names are used for logs/events/errors.

3. Retry errors
- If a step keeps failing, engine throws `RetryLimitExceededError`.
- The original cause is available in `error.cause`.

4. Runtime support
- Works in Node.js and browser environments.
- Uses Web Crypto (`globalThis.crypto`) for IDs/backoff jitter.

## Runtime API (Recommended for Real Apps)

Use `createRuntime` when you need custom storage/config/event handling.

```ts
import { createRuntime, InMemoryStorageAdapter } from 'flow-engine-core';

interface Ctx {
  id: string;
  processed: boolean;
}

const storage = new InMemoryStorageAdapter<Ctx>();

const runtime = createRuntime<Ctx>({
  storage,
  config: {
    retry: {
      retries: 2,
      backoffMs: 100,
      maxBackoffMs: 1000,
      jitter: 0.2,
    },
    logger: {
      info: (event, data) => console.log(event, data),
      warn: (event, data) => console.warn(event, data),
      error: (event, data) => console.error(event, data),
    },
  },
});

runtime.on('workflowStarted', (e) => console.log('started', e.executionId));
runtime.on('workflowCompleted', (e) => console.log('done', e.executionId));

await runtime
  .workflow('demo')
  .step('process', ({ context }) => {
    context.processed = true;
  })
  .run({ id: '1', processed: false });
```

## Persistence

Storage is adapter-based. Built-in adapter:

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

You can implement Redis/Postgres/Mongo adapters later.

## Events

Supported events:

- `workflowStarted`
- `workflowCompleted`
- `workflowFailed`
- `workflowCancelled`
- `stepStarted`
- `stepCompleted`
- `stepFailed`

### Global Flow Hooks (listen from anywhere)

Use flow-name hooks when you want app-wide listeners for a specific workflow:

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

// use "*" to listen all flows
const offAll = onFlowEvent('*', 'workflowFailed', (payload) => {
  console.error('any flow failed', payload.name);
});
```

## Errors

Custom errors:

- `WorkflowError`
- `StepTimeoutError`
- `RetryLimitExceededError`
- `ValidationError`
- `PersistenceError`

## Security Guarantees

- no `eval` / no `Function` constructor
- context validation (plain object + forbidden keys)
- delay format validation (`ms`, `s`, `m`, `h`)
- bounded retries with exponential backoff + jitter + cap
- timeout controls per step and workflow
- max step and parallel limits
- duplicate execution ID protection
- cancellation via `AbortController`
- persistence boundary protection via cloned records

## Testing This Library

```bash
npm install
npm run ci
```

- `npm run ci` runs lint, typecheck, build, and tests.
- Main test file: `tests/workflow.test.mjs`

## Benchmark

```bash
npm run bench
```

## Troubleshooting

1. `RetryLimitExceededError`
- Inspect `error.cause`.
- Usually step keeps failing due to business logic/runtime error.

2. `ReferenceError: unstableAttempts is not defined`
- Define variable in scope before using in step handler.

3. `Secure crypto API is unavailable in this runtime`
- Your runtime does not expose `globalThis.crypto`.
- Use a modern browser/runtime or polyfill Web Crypto.

## Limitations

- In-memory storage is process-local only
- No distributed locking
- Resume assumes same workflow definition and compatible context

## Roadmap

1. Redis adapter
2. Postgres adapter
3. Mongo adapter
4. Optional metrics helper
