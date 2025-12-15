import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    base: '/',
    css: {
      postcss: {
        plugins: [
          tailwindcss,
          autoprefixer,
        ],
      },
    },
    plugins: [
      react(),
      {
        name: 'local-cors-proxy',
        configureServer(server) {
          server.middlewares.use('/proxy', async (req: any, res: any, next: any) => {
            try {
              // Construct full URL to parse query params
              const urlObj = new URL(req.url, `http://${req.headers.host}`);
              const targetUrl = urlObj.searchParams.get('url');

              if (!targetUrl) {
                res.statusCode = 400;
                res.end('Missing url param');
                return;
              }

              console.log('[LocalProxy] Proxying request to:', targetUrl);

              // Use standard fetch (Node 18+)
              const response = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                  'Accept-Language': 'en-US,en;q=0.5',
                }
              });

              if (!response.ok) {
                console.error(`[LocalProxy] Upstream Block/Error: ${response.status}`);
              }

              const contentType = response.headers.get('content-type') || 'text/html';
              const text = await response.text();

              // Forward important headers
              res.setHeader('Content-Type', contentType);
              res.setHeader('Access-Control-Allow-Origin', '*');

              res.statusCode = response.status;
              res.end(text);

            } catch (e: any) {
              console.error('[LocalProxy] Error:', e);
              res.statusCode = 500;
              res.end(`Proxy Error: ${e.message}`);
            }
          });
        }
      }
    ],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
