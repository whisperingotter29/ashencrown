// Web build (what Vercel serves). The desktop/ app has its own build; keep Vite's dev server
// from watching or scanning it.
import { defineConfig } from 'vite';
export default defineConfig({
  server: { watch: { ignored: ['**/desktop/**'] } },
  optimizeDeps: { entries: ['index.html'] },
});
