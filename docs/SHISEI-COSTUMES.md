# Shisei 中国历代服装

## Shisei 中国历代服装

- 来源：[wquguru/shisei](https://github.com/wquguru/shisei)，固定修订 `8f61ceab10e45f8d3afd254900903733a0ba76ee`。
- 仅导入 `data/costumes.json` 的 HC 类服装：60 个候选，C007、C014、C015 没有图片，最终 57 套、227 个有效视角。没有导入 Shisei 姿势。
- 一级分类为现实，分类为中国历代，ID 为 `shisei-C001` 等。一套一张卡，详情支持正面、斜侧、侧面、背面中实际存在的视角。
- 标注 **Shisei / wquguru · AI 生成服装参考 · CC0**。这些素材是创作参考，并非专业历史服饰复原。
- 原项目图片及其自有数据为 CC0 1.0。固定版本的原文 [LICENSE-images](../data/shisei/LICENSE-images) 与 [NOTICE](../data/shisei/NOTICE) 随素材保留。CC0 本身不要求署名，本项目仍展示来源。
- 收录原始 w300/w900 WebP 各 227 张，共 454 个文件、6,054,726 字节（约 5.77 MiB），不重编码。每个文件的固定来源地址、大小与 SHA-256 记录在 `data/shisei/images-manifest.json`。

## 更新与复现

运行 `python scripts/import_shisei_costumes.py`，从固定快照重建中文目录及清单，不访问网络。缺图时可加 `--download-shisei`；raw 域不可达可加 `--github-cli /path/to/gh`，经已登录 CLI 获取固定修订的相同文件，不读取或输出令牌。

服装总数为 1,904：原写实 1,407、CharaDB 440、中国历代 57；旧 ID 保留。配方保存 selectedView 和兼容的旧图片字段，旧配方仍可读取。ComfyUI 服装和角色配方节点新增可选 costume_view，默认 front；不存在的非默认视角明确报错。更新快照前须审核固定修订、授权与目录数量，再更新脚本的固定哈希。
