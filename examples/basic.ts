import { workflow } from '../src/index.js';

interface SignupContext {
  email: string;
  userId?: string;
  welcomeSent: boolean;
}

await workflow<SignupContext>('user-signup')
  .step('create-user', ({ context }) => {
    context.userId = 'u_123';
  })
  .step(
    'send-email',
    async ({ context }) => {
      context.welcomeSent = true;
      await Promise.resolve();
    },
    {
      retries: 3,
      timeout: 5000,
    },
  )
  .parallel([
    ({ logger }) => {
      logger.info?.('analytics.track');
    },
    ({ logger }) => {
      logger.info?.('audit.log');
    },
  ])
  .delay('5s')
  .run({
    email: 'user@example.com',
    welcomeSent: false,
  });
