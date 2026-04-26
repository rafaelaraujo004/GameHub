import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: [
        '**/launcher/metadata_cache.json',
        '**/launcher/games_cache.json',
      ],
    },
  },
})
