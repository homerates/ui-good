import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone Vite config — deliberately independent of the main app's Next.js build,
// so this module can be developed, tested, and eventually packaged/licensed on its own.
export default defineConfig({
  plugins: [react()],
});
