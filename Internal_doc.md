# Internal Documentation

This file is for maintainers and internal project planning.

## Local Validation

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

## Limitations

- In-memory storage is process-local only
- No distributed locking
- Resume assumes same workflow definition and compatible context

## Roadmap

1. Redis adapter
2. Postgres adapter
3. Mongo adapter
4. Optional metrics helper
