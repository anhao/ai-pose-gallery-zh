# 服装素材来源与更新

现有写实服装 ID 与 CharaDB 的 440 个 ID 保持不变。

## ギア动漫服装

- 原站：[衣装集 アニメ版](https://ai-costume-anime-gallery.pages.dev/)，作者ギア（@giaaibusi）。
- 收录 1,320 条元数据，ID 为 `gia-anime-原ID`；一级分类为二次元，八个中文分类、名称、标签复用对应写实条目。
- 固定对照快照来自 [hongye007/open-pose-costume](https://github.com/hongye007/open-pose-costume/blob/f08f2e48675caeec85f091dde308cd906582b50f/data/source/costume-anime.json)，修订 `f08f2e48675caeec85f091dde308cd906582b50f`。
- 项目仅保存元数据快照及其 SHA-256；缩略图、预览图、PNG 原图直接请求原站，不批量下载、不镜像。图片使用条件以原作者说明为准，不能把本项目代码许可理解为图片再分发许可。
- 原站不可用时会影响图片加载。历史快照用于稳定目录和追溯，不构成图片备份。

## 复现与验证

运行 `python scripts/import_gia_anime.py`，从固定快照重建目录和来源记录，不下载图片。更新快照前先审核原作者说明及上游修订，并更新固定哈希和数量校验。

服装总数为 3,167：原写实 1,407、CharaDB 440、ギア动漫 1,320。ComfyUI 只允许目录精确收录的原图地址，保持 CharaDB JPEG 并支持ギア PNG/WebP；限制 10 MiB、2,000 万像素、20 秒超时，拒绝上游重定向和任意 URL。未知外部来源 ID 明确报错。
