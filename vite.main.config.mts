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
    rollupOptions: {
      // node-pty loads a native binary and its helper program from its own folder, so it can't
      // be bundled; it's copied into the app next to the bundle instead (see forge.config.mts).
      external: ['node-pty'],
    },
  },
});
