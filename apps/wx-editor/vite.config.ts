import path from 'node:path'
import process from 'node:process'

import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'
// @ts-expect-error package has no bundled type declarations in this project setup
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vitejs.dev/config/
const DEFAULT_BUILD_BASE = `/wx-editor/`

export default defineConfig(({ command }) => ({
  // Dev keeps root path, production build uses deploy sub-path.
  // You can override in CI by passing APP_BASE, e.g. APP_BASE=/.
  base: command === `serve` ? `/` : (process.env.APP_BASE || DEFAULT_BUILD_BASE),
  define: {
    process,
  },
  plugins: [
    vue(),
    UnoCSS(),
    vueDevTools(),
    nodePolyfills({
      include: [`path`, `util`, `timers`, `stream`, `fs`],
      overrides: {
        // Since `fs` is not supported in browsers, we can use the `memfs` package to polyfill it.
        // fs: 'memfs',
      },
    }),
    process.env.ANALYZE === `true` && visualizer({
      emitFile: true,
      filename: `stats.html`,
    }),
    AutoImport({
      imports: [
        `vue`,
        `pinia`,
        `@vueuse/core`,
      ],
      dirs: [
        `./src/stores`,
        `./src/utils/toast`,
      ],
    }),
    Components({
      resolvers: [],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, `./src`),
    },
  },
  css: {
    devSourcemap: true,
  },
  server: {
    proxy: {
      '/wx-editor-api': {
        target: process.env.WX_EDITOR_BACKEND_URL || 'http://127.0.0.1:3210',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/wx-editor-api/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: `static/js/md-[name]-[hash].js`,
        entryFileNames: `static/js/md-[name]-[hash].js`,
      },
    },
  },
}))


