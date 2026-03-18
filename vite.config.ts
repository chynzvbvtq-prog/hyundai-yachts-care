import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// 빌드 후 _routes.json 생성 플러그인
function routesPlugin() {
  return {
    name: 'cloudflare-routes',
    closeBundle() {
      const routes = {
        version: 1,
        include: ['/*'],
        exclude: [
          '/index.html',
          '/login.html',
          '/register.html',
          '/booking.html',
          '/dashboard.html',
          '/admin.html',
          '/static/*'
        ]
      }
      fs.writeFileSync(
        path.resolve('dist/_routes.json'),
        JSON.stringify(routes, null, 2)
      )
      console.log('✅ _routes.json generated')
    }
  }
}

export default defineConfig({
  plugins: [
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    }),
    routesPlugin()
  ]
})
