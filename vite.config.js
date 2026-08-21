import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => ({
  // Tauri loads the production bundle from a local webview, so assets must be
  // relative instead of assuming a hosted root path.
  base: mode === 'kiosk' || mode === 'tauri' ? './' : '/',
  plugins: [react(), tailwindcss()],
  // Kiosk mode is intentionally same-origin so a Cloudflare Tunnel can proxy
  // both the UI and the local DSLR service without any mixed-content request.
  define: {
    'import.meta.env.VITE_KIOSK_SAME_ORIGIN': JSON.stringify(mode === 'kiosk' ? 'true' : process.env.VITE_KIOSK_SAME_ORIGIN || ''),
  },
  optimizeDeps: {
    exclude: ['web-gphoto2'],
  },
  worker: {
    format: 'es',
  },
  server: {
    host: process.env.TAURI_DEV_HOST || '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['photo-box.my.id', 'www.photo-box.my.id'],
    // headers: {
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    // },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['photo-box.my.id', 'www.photo-box.my.id'],
    // headers: {
    //   'Cross-Origin-Opener-Policy': 'same-origin',
    //   'Cross-Origin-Embedder-Policy': 'require-corp',
    // },
  }
}))
