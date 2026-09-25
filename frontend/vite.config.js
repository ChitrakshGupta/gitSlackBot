import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy only the backend-initiating routes.
      // NOTE: /auth/callback is intentionally EXCLUDED — it's a React page
      // rendered by the frontend (AuthCallbackPage), and GitHub redirects to
      // port 8000 directly anyway (that's the registered OAuth callback URL).
      '/auth/github': { target: 'http://localhost:8000', changeOrigin: true },
      '/auth/me': { target: 'http://localhost:8000', changeOrigin: true },
      '/auth/slack/callback': { target: 'http://localhost:8000', changeOrigin: true },
      '/auth/slack': { target: 'http://localhost:8000', changeOrigin: true },
      '/webhook': { target: 'http://localhost:8000', changeOrigin: true },
      '/health': { target: 'http://localhost:8000', changeOrigin: true },
      '/events': { target: 'http://localhost:8000', changeOrigin: true },
      '/repos/github': { target: 'http://localhost:8000', changeOrigin: true },
      '/repos': { target: 'http://localhost:8000', changeOrigin: true },
      '/settings': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
