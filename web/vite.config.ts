import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, '..', 'api');

/**
 * In development, serve /api/<name> with the very same handler files that
 * Vercel deploys (api/<name>.ts), so local and production behave alike.
 */
function vercelApiInDev(): Plugin {
  return {
    name: 'sootsayer-api-dev',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.slice('/api/'.length).replace(/\/$/, '');
        if (!/^[a-z]+$/.test(name)) return next();
        try {
          const mod = (await server.ssrLoadModule(path.join(apiDir, `${name}.ts`))) as {
            GET?: (r: Request) => Promise<Response>;
          };
          if (!mod.GET) return next();
          const response = await mod.GET(new Request(url.toString()));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          next(err as Error);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vercelApiInDev()],
  server: { fs: { allow: [here, apiDir] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
