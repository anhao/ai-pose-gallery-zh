# 素材来源与许可

本仓库代码许可不自动覆盖第三方图片。

## 原有图库

原有姿势、现实服装、人像来自 ギア（[@giaaibusi](https://x.com/giaaibusi)）的公开站点：

- https://ai-pose-gallery.pages.dev/ 与 https://ai-pose-depth-gallery.pages.dev/
- https://ai-costume-gallery.pages.dev/
- https://ai-portrait-gallery.pages.dev/（人像库声明 CC0 1.0）

原有数据和图片归属保持其来源声明；本项目不对第三方素材主张所有权，不得将图库图片打包倒卖。

## CharaDB 二次元服装

作者：たき AI（[@taki_auto](https://x.com/taki_auto)）。[原站](https://charadb-2fi.pages.dev/) · [官方仓库](https://github.com/taki-ttt/charadb) · [官方完整 LICENSE](https://github.com/taki-ttt/charadb/blob/main/LICENSE)。

本次仅收录官方公开版的 440 套服装元数据，没有收录发型、姿势、特典版、第三方翻译或图片。原始服装记录在 `data/charadb/outfits-public.json`，中文名称为本项目独立翻译；英文 Danbooru 标签保留原文。提交版本、原文件 SHA-256、服装快照 SHA-256 记录在 `data/charadb/source.json`。

官方按材料分别授权：

- 官方应用和脚本代码：MIT，复用时须保留其版权与许可声明。
- 标签、日文名称与 wildcards：CC0 1.0，可用于任何目的，无需署名。
- 图片（原图、缩略图、线稿）：**不适用 MIT 或 CC0**。免费使用，无需署名；仅作参考素材（示例或 ControlNet 底图）。禁止原图及加工图再分发、转载或转售，禁止将图片本体放入销售作品；禁止用于表现真实人物或未成年人。还须遵守生成模型条款（官方提及 NoobAI-XL 1.0 License / Fair AI Public License 1.0-SD）。

关键原文：`画像そのもの(元サイズ・加工後を含む)の再配布・転載・再販はしないでください`；`実在の人物を表す用途、未成年を表す用途には使わないでください`。

本项目**没有取得远程展示、镜像、再分发或向生成模型传图的额外授权**。热链、变成缩略图、拼图或署名均不自动构成授权。原作者未明确界定输入真人照片并生成虚构角色等边界，不应理解为已允许真人换装合成。使用者须自行确认具体用途符合作者最新条件。首次加入配方或执行节点前须确认来源条件；此确认只是阅读确认，不是作者授权或图像内容检测。

网页与 ComfyUI 选图器直接读取原站 URL；仓库、构建、发布包不保存这些图片，不提供镜像或公共图片缓存。节点只允许已提交目录中精确匹配的官方原图地址，禁重定向，限时、限大小、校验格式后在内存解码。合成操作可能将参考图发送给使用者选择的模型服务或本地 ComfyUI；不能以技术可用推导为该用途已获授权。

默认随机配方排除 CharaDB 条目。SFW 保留原规则，另按公开版泳装及性感关键词隐藏部分条目；它不判断人物实际年龄、身份或全部敏感画面。中文名称不改变原图内容。

来源离线或拒绝跨域时，图片预览、拼图与生成可能失败；已提交元数据仍可供检索、筛选和复制标签。官方许可及资源可用性可能更新，以来源最新说明为准。

## 更新

默认离线重建：`python scripts/import_charadb.py`。更新时先审查官方完整提交 SHA 与许可，再执行 `python scripts/import_charadb.py --revision <40位SHA>`，补齐 `data/charadb/names-zh.json`，检查新增分类及敏感规则。脚本不执行第三方 JavaScript，不下载图片。
