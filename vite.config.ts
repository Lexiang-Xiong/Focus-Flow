import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// 仅 dev：BYOK 请求经此中间件服务端转发到用户的 base_url，绕过浏览器 CORS。
// 前端打 `POST /__byok/chat/completions`，带 `x-byok-base: https://.../v1` 头；
// 这里转发到 `${base}/chat/completions`。绝不打印 Authorization。生产构建不包含此插件（apply:'serve'）。
function byokDevProxy(): Plugin {
  return {
    name: 'byok-dev-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__byok', async (req, res) => {
        try {
          const base = req.headers['x-byok-base'];
          if (typeof base !== 'string' || !base) {
            res.statusCode = 400;
            res.end('missing x-byok-base header');
            return;
          }
          // connect 已剥掉挂载前缀 /__byok，req.url 形如 /chat/completions
          const target = base.replace(/\/+$/, '') + (req.url || '');
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = Buffer.concat(chunks);
          const upstream = await fetch(target, {
            method: req.method,
            headers: {
              'content-type': (req.headers['content-type'] as string) || 'application/json',
              ...(req.headers['authorization']
                ? { authorization: req.headers['authorization'] as string }
                : {}),
            },
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react(), byokDevProxy()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 8088,
    strictPort: false,
    host: '0.0.0.0',
  },
});
