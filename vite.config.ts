import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (env.VITE_DATA_MODE === 'live') {
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_AMAP_JS_KEY']) {
      if (!env[name]) throw new Error(`正式模式缺少公开配置 ${name}`)
    }
  }
  return {
    plugins: [
      vue(),
      AutoImport({ resolvers: [ElementPlusResolver()], dts: false }),
      Components({ resolvers: [ElementPlusResolver()], dts: false }),
    ],
    base: process.env.GITHUB_ACTIONS ? '/find-your-student/' : '/',
    build: { chunkSizeWarningLimit: 800 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  }
})
