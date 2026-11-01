import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const proxy = { '/api': { target: 'http://127.0.0.1:4318', changeOrigin: true } };

export default defineConfig({
  plugins: [react(), {
    name: 'local-media-only',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api') && !['localhost:5173', '127.0.0.1:5173'].includes(request.headers.host ?? '')) {
          response.writeHead(403); response.end('acesso somente pelo computador local.'); return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith('/api') && !['localhost:4173', '127.0.0.1:4173'].includes(request.headers.host ?? '')) {
          response.writeHead(403); response.end('acesso somente pelo computador local.'); return;
        }
        next();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.local-media/**', '**/.tools/**'] } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
});
