import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser calls /api/...; in development Vite forwards it to the server (so no CORS fuss and no server address in the code).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:4100', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') } }
  }
})
