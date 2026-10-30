import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const realtimeProxyTarget = process.env.VITE_REALTIME_PROXY_TARGET ?? 'http://127.0.0.1:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/health': realtimeProxyTarget,
      '/socket.io': {
        target: realtimeProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
