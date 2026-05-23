import { createRuntime, InMemoryStorageAdapter } from '../dist/index.js';

const storage = new InMemoryStorageAdapter();
const runtime = createRuntime({
  storage,
  config: {
    logger: {
      info: (event, data) => console.log(`[info] ${event}`, data ?? ''),
      warn: (event, data) => console.warn(`[warn] ${event}`, data ?? ''),
      error: (event, data) => console.error(`[error] ${event}`, data ?? ''),
    },
    retry: {
      retries: 2,
      backoffMs: 100,
      maxBackoffMs: 500,
      jitter: 0.1,
    },
  },
});

runtime.on('workflowStarted', (payload) => console.log('EVENT workflowStarted', payload));
runtime.on('stepStarted', (payload) => console.log('EVENT stepStarted', payload));
runtime.on('stepCompleted', (payload) => console.log('EVENT stepCompleted', payload));
runtime.on('workflowCompleted', (payload) => console.log('EVENT workflowCompleted', payload));

let unstableAttempts = 0;

const result = await runtime
  .workflow('user-signup')
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
      await new Promise((resolve) => setTimeout(resolve, 50));
      context.analyticsTracked = true;
    },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    },
  ])
  .delay('1s')
  .run({
    email: 'user@example.com',
    welcomeSent: false,
    analyticsTracked: false,
  });

console.log('FINAL CONTEXT', result);
