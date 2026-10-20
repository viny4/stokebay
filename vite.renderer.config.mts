import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The renderer only loads its own bundle; everything else goes through the preload bridge.
// Dev needs two relaxations: React Refresh injects an inline script, and Vite's HMR uses a websocket.
function contentSecurityPolicy(): Plugin {
  return {
    name: 'project-hud:csp',
    transformIndexHtml(_html, ctx) {
      const dev = ctx.server !== undefined;
      const policy = [
        "default-src 'self'",
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: hud-media:",
        "font-src 'self'",
        dev ? "connect-src 'self' ws:" : "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
});
