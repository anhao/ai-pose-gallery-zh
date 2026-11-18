---
name: pose-gallery
description: 打开 AI Pose Gallery 中文人体姿势图库，按动作和视角检索姿势参考、查看同组图片，或导出选定原图。适用于用户明确需要人物姿势参考或使用此图库时。
---

# AI Pose Gallery 中文版

使用本插件的 `pose_gallery_*` MCP 工具读取本地素材；不需要联网或模型 API。

- 打开图库：调用 `pose_gallery_open`，展示可固定的 Codex 原生图库界面；如宿主不支持此界面，再将返回 URL 交给 Codex `open_in_codex` 的 browser 目标。HTTP 服务随 MCP 会话退出。
- 找参考：用 `pose_gallery_search`。query 是空格分词的中文关键词，所有词均需匹配；system、category、angle 是精确筛选。angle 可用正面、斜侧、侧面、俯视、仰视。先展示少量匹配，缺少结果时减少筛选；不要宣称它支持语义向量搜索。
- 看同组角度：将搜索得到的精确 ID 传给 `pose_gallery_details`；`pose_gallery_image` 按需返回缩略图，full=true 返回原图。不要将全库图片载入上下文。用户只需要路径时使用返回的本地绝对路径。
- 导出：用户已选定素材和输出目录时调用 `pose_gallery_export`，output_dir 必须为绝对路径。工具同时导出 PNG 和来源 JSON，拒绝覆盖已有文件。图片下载和选图不等于已经完成图像生成；如需生成或编辑，交给当前可用的图像工具，并遵守其要求。

数据为 288 组姿势、1439 张多角度图；缩略图与原图合计 2878 文件。部分分类含成人向内容，按用户实际需求筛选。图片及原始数据不适用代码的 MIT 许可；上游声明不得商用，不能把封装当作重新授权。素材由安装者从本仓库准备，完整权利说明见上游 README 与 LICENSE。
