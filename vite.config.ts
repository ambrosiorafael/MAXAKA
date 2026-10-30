import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const realtimeProxyTarget = process.env.VITE_REALTIME_PROXY_TARGET ?? 'https://api.maxaka.com'

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
        configure: (proxy) => {
          const setAllowedOrigin = (request: { setHeader: (name: string, value: string) => void }) => {
            request.setHeader('origin', 'https://maxaka.com')
          }
          proxy.on('proxyReq', setAllowedOrigin)
          proxy.on('proxyReqWs', setAllowedOrigin)
        },
      },
    },
  },
})
