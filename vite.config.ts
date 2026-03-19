import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// 빌드 후 _routes.json 생성 플러그인
// HTML 파일들을 exclude → Cloudflare Pages Assets가 직접 서빙하면
// wrangler pages dev 가 308 리다이렉트를 강제해 외부에서 무한루프 발생.
// 따라서 *.html 경로와 확장자 없는 경로 모두 Worker(include)에서 처리하고,
// /static/* 정적 자산만 Pages Assets에서 서빙.
function routesPlugin() {
  return {
    name: 'cloudflare-routes',
    closeBundle() {
      const routes = {
        version: 1,
        include: ['/*'],
        exclude: [
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
