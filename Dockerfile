# syntax=docker/dockerfile:1
# --- build: 只編譯前端程式碼（圖片/資料以 volume 掛載，不進映像檔）---
FROM node:22-alpine AS build
WORKDIR /app
# lockfile 為 v9，固定使用 pnpm 10
RUN corepack enable && corepack prepare pnpm@10 --activate
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# --- runtime: nginx 提供靜態檔 ---
FROM nginx:1.27-alpine
# nginx 官方映像會在啟動時對 templates/*.template 做 envsubst（只代換已定義的環境變數）
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV COMFYUI_UPSTREAM=http://host.docker.internal:8188
COPY --from=build /app/dist /usr/share/nginx/html
COPY robots.txt sitemap.xml og-cover.jpg /usr/share/nginx/html/
EXPOSE 80
