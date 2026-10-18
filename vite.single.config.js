// Single-file build for static hosting: JS, CSS, fonts and the terrain worker all inlined into dist-single/index.html.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: 1e8 },
  server: { watch: { ignored: ['**/desktop/**'] } },
  optimizeDeps: { entries: ['index.html'] },
});
