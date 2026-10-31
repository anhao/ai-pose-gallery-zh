#!/usr/bin/env bash
# 构建 Cloudflare Pages 需要的发布目录 dist/（React + Vite + 静态图片数据）。
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d "node_modules" ]; then
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install --frozen-lockfile
  else
    npm install
  fi
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm build
else
  npm run build
fi

cp -R _headers robots.txt sitemap.xml og-cover.jpg data thumbs img dist/
printf "/* /index.html 200\n" > dist/_redirects

echo "dist ready:"
du -sh dist
find dist -type f | wc -l
