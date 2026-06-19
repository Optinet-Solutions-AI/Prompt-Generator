import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Dev-only middleware that proxies /api/image-proxy requests.
 * In production, Vercel serves the real serverless function at api/image-proxy.ts.
 */
function imageProxyPlugin(): Plugin {
  return {
    name: 'image-proxy',
    configureServer(server) {
      server.middlewares.use('/api/image-proxy', async (req, res) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const target = url.searchParams.get('url');
        if (!target) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Missing url param' }));
          return;
        }
        try {
          const upstream = await fetch(target, {
            headers: { 'User-Agent': 'PromptGenerator/1.0' },
            redirect: 'follow',
          });
          if (!upstream.ok) {
            res.statusCode = upstream.status;
            res.end(JSON.stringify({ error: `Upstream ${upstream.status}` }));
            return;
          }
          const ct = upstream.headers.get('content-type') || 'image/png';
          const buf = Buffer.from(await upstream.arrayBuffer());
          res.setHeader('Content-Type', ct);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(buf);
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'Proxy fetch failed' }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev-only: forward /api/* to a running `vercel dev` (default :3939) so the
    // serverless functions (OpenAI, Supabase, etc.) work while vite serves the
    // UI. Override the target with VITE_API_PROXY. Has no effect in production.
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://localhost:3939",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mode === "development" && imageProxyPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
