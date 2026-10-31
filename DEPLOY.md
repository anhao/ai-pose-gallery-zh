# Docker 地端部署

```bash
docker compose up -d --build
# 開啟 http://localhost:8080   （改埠：PORT=9000 docker compose up -d --build）
```

- `web`：nginx，提供前端與 `data/`、`thumbs/`、`img/`（以唯讀 volume 掛載，映像檔不含 ~2GB 圖片）
- `proxy`：Node 小服務，對應 `/api/proxy`（千問 / 豆包 CORS 轉發；Gemini、OpenAI 為瀏覽器直連）
- API Key 於網頁「設定」頁填寫，無需環境變數
- 停止：`docker compose down`
