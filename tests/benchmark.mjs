import { workflow } from '../dist/index.js';

async function runBenchmark(iterations) {
  const start = performance.now();

  for (let i = 0; i < iterations; i += 1) {
    await workflow('bench')
      .step('inc', ({ context }) => {
        context.n += 1;
      })
      .run({ n: 0 });
  }

  const elapsed = performance.now() - start;
  console.log(`Executed ${iterations} workflows in ${elapsed.toFixed(2)}ms`);
}

await runBenchmark(1000);
