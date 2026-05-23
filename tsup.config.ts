import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2022',
    outDir: 'dist',
  },
  {
    entry: {
      'index.browser': 'src/index.ts',
    },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    outDir: 'dist',
  },
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['iife'],
    globalName: 'FlowEngine',
    dts: false,
    sourcemap: true,
    target: 'es2020',
    platform: 'browser',
    outDir: 'dist',
    minify: true,
    outExtension() {
      return {
        js: '.global.js',
      };
    },
  },
]);
