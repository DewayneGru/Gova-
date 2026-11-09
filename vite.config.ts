import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isHmrDisabled = process.env.DISABLE_HMR === 'true' || env.DISABLE_HMR === 'true';
  const port = parseInt(process.env.PORT || env.PORT || '3000', 10);
  const rootDir = process.cwd();
  const srcDir = path.resolve(rootDir, 'src');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: /^@\/src\//, replacement: `${srcDir}/` },
        { find: /^@\//, replacement: `${srcDir}/` },
        { find: '@', replacement: srcDir },
      ],
      extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'lucide-react',
        'motion',
        'three',
      ],
    },
    server: {
      port,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify - file watching is disabled to prevent flickering during agent edits.
      hmr: isHmrDisabled ? false : true,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: isHmrDisabled ? null : {},
    },
  };
});
