import { defineConfig } from 'vite';

// Main and preload both live in an `index.ts`, so the output names are set explicitly
// to keep the two bundles from overwriting each other in .vite/build.
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main/index.ts',
      fileName: () => 'main.cjs',
      formats: ['cjs'],
    },
  },
});
