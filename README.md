# AI 角色参考与合成工作台 · 中文版（3合1）

> **姿势库（1,439 张） + 服装库（1,440 套） + 人像库（1,466 位） = 4,345 条中文参考数据 / 10,097 张本地高清图**，集成多协议 AI 角色合成台。

![画廊预览](docs/preview.jpg)

<details><summary>手机端预览</summary>

![手机端预览](docs/mobile.jpg)

</details>

**在线演示：** <https://ai-pose-gallery.anhao.app/>
**原始站点：**
- 姿势库：<https://ai-pose-gallery.pages.dev/>
- 服装库：<https://ai-costume-gallery.pages.dev/>
- 人像库：<https://ai-portrait-gallery.pages.dev/>

**原作者：** ギア（@giaaibusi）
**中文版维护：** Anhao · [X @anhao_ai](https://x.com/anhao_ai)
**GitHub：** <https://github.com/anhao/ai-pose-gallery-zh>

---

## 这是什么

原站是ギア（@giaaibusi）发布的三大 AI 绘画参考图库（姿势、服装、人像），元数据全部为日文，且分散在三个独立站点。本仓库（v2.0）完成了**三站合一与工作台升级**：

1. **三库全量镜像（10,097 张图）** —— 完整拉取姿势库（2,878 张）、服装库（2,880 张）、人像库（4,339 张，含全身图）的全部缩略图与高清原图，支持纯离线/静态托管。
2. **100% 完整汉化（1,280 条词条）** —— 日文体系、分类、姿势名称、服装款式、色系、人像主题、发型、发色、表情、饰品等全部逐条译为地道中文，零日文残留。
3. **三合一 AI 角色合成工作台** —— 基于 **React 19 + Tailwind CSS 4 + TypeScript 7 + shadcn/ui + TanStack Router** 构建的响应式多页面应用（兼容 PC / 平板 / 手机）：
   - 从三大图库任意挑选 **人像 + 服装 + 姿势** 组合配方，或一键随机捏人；
   - 支持拖拽 / 剪贴板粘贴（`Cmd+V` / `Ctrl+V`） / URL 添加多张自定义附加参考图；
   - 内置 **5 大 AI 图像协议直连**（Gemini、OpenAI GPT、阿里千问 Qwen、字节豆包 Seedream、**本地 ComfyUI 工作流引擎**），支持直接传递公网图片 URL、Base64 或自动上传至本地 ComfyUI，生成记录通过 **IndexedDB** 本地持久化保存。
4. **原生 ComfyUI 自定义节点插件（`custom_nodes`）** —— 本仓库同时是一个完整的 ComfyUI 插件！直接 `git clone` 到 `ComfyUI/custom_nodes/` 即可在 ComfyUI 内使用 **姿势 / 服装 / 人像 / 三合一角色配方** 4 个自定义节点与内置的 4,345 张中文可视化选图器。

---

## 核心功能

### 1. 三大参考图库（姿势 / 服装 / 人像）
- **姿势参考库（`/poses`）**：4 大体系、26 个动作分类、288 组姿势、5 种视角（正面 / 斜侧 / 侧面 / 俯视 / 仰视），支持**按姿势分组 / 逐张浏览**双模式及卡片内多角度切换。
- **服装参考库（`/costumes`）**：4 大体系（标准 / 性感 / 绅士 / 梦幻）、40 种款式分类、12 种色系筛选。
- **人像参考库（`/portraits`）**：3 大体系、12 种主题、发型 / 发色 / 眼睛颜色 / 表情多维筛选，灯箱支持**半身肖像 / 全身立绘**一键切换。
- **统一交互体验**：关键词实时检索、灯箱高清原图预览与 PNG 下载、一键「加入合成配方」。

### 2. AI 角色合成台（`/studio`）
- **3+N 参考图组合**：3 个核心槽位（人像 / 服装 / 姿势）+ 任意张自定义附加参考图（点击上传、拖拽文件、剪贴板粘贴、填写图片 URL）。
- **参考拼图预览与导出**：弹窗查看三合一高清参考拼图（`1800×1200` Canvas 合成），支持一键下载拼图 PNG。
- **12 种画风预设 & 自动提示词**：内置「无预设（跟随参考图）」、日系赛璐璐、厚涂插画、写实摄影、水彩、国风、3D 渲染等 12 种画风，根据已选素材自动组装中英双语结构化 Prompt。
- **多协议 AI 生图与高级参数**：
  - **Google Gemini**：`gemini-3.1-flash-image-preview`、`gemini-3-pro-image-preview`、`gemini-2.5-flash-image`（支持宽高比 `aspectRatio`、分辨率 `1K/2K/4K`）
  - **OpenAI GPT Image**：`gpt-image-1.5`、`gpt-image-1`、`gpt-image-1-mini`（支持 `/v1/images/edits` JSON URL 直传 / Multipart 上传、尺寸、质量、背景透明度）
  - **阿里千问 Qwen-Image**：`qwen-image-2.0-pro`、`qwen-image-2.0`、`qwen-image-edit-max`（支持 `multimodal-generation` 多图参考输入、智能改写 `prompt_extend`、水印开关）
  - **字节豆包 Seedream**：`doubao-seedream-5-0-260128`、`doubao-seedream-4-5-251128`、`doubao-seedream-4-0-250828`（支持多图融合 `image: [...]`、2K/4K 分辨率）
  - **本地 ComfyUI 直连**：支持一键把三合一参考拼图及单张人像/服装/姿势图自动上传至本地 ComfyUI（`/upload/image`），注入自定义 API 工作流占位符（`{{prompt}}`、`{{seed}}`、`{{width}}`、`{{height}}`、`{{composite_image}}`、`{{portrait_image}}`、`{{costume_image}}`、`{{pose_image}}`）或自动识别 `CLIPTextEncode` / `KSampler` / `LoadImage` 节点提交 `/prompt` 队列并轮询取回成品图；支持导出通用 `.api.json` 工作流模板。
- **跨页面后台生图 & IndexedDB 历史记录**：切换页面不会中断正在进行的生图请求；生成结果自动存入浏览器 IndexedDB（避免 `localStorage` 容量限制），支持复用提示词与原图下载。

### 3. ComfyUI 原生自定义节点插件（`comfyui_plugin/`）
将本仓库克隆到 `ComfyUI/custom_nodes/ai-pose-gallery-zh` 后，ComfyUI 画布右键菜单 **「AI角色三合一参考图集」** 下自动提供 4 个节点：
- **AI 姿势参考图 (`PoseGalleryNode`)**：输出 `姿势图 (IMAGE)`、`图片ID`、`姿势提示词`
- **AI 服装参考图 (`CostumeGalleryNode`)**：输出 `服装图 (IMAGE)`、`图片ID`、`中文服装描述`、`英文服装Prompt`
- **AI 人像参考图 (`PortraitGalleryNode`)**：输出 `人像图 (IMAGE)`、`图片ID`、`人像发型描述`
- **AI 角色三合一合成配方 (`CharacterRecipeNode`)**：一个节点同时输出 `人像图`、`服装图`、`姿势图`、`三合一拼图` 以及自动组装的 `中文合成Prompt` 与 `英文合成Prompt`，并内置 **4,345 张中文可视化弹窗选图器**与节点内实时缩略图预览。

---

## 数据规模

| 图库 | 体系划分 | 记录数 | 本地图片文件数 |
| --- | --- | ---: | ---: |
| **姿势库（Pose）** | 全身标准 (365) · 全身性感 (399) · 上半身 (400) · 双人缠绵 (275) | 1,439 | 2,878 张（缩略图 + 原图） |
| **服装库（Costume）** | 标准系 (400) · 性感系 (400) · 绅士系 (400) · 梦幻系 (240) | 1,440 | 2,880 张（缩略图 + 原图） |
| **人像库（Portrait）** | 标准系 (810) · 梦幻系 (416) · 绅士系 (240) | 1,466 | 4,339 张（缩略图 + 肖像原图 + 全身原图） |
| **合计** | **11 个体系** | **4,345** | **10,097 张** |

---

## 技术栈与目录结构

- **前端框架**：React 19.3 + TypeScript 7.0 + Vite 8 (Rolldown)
- **路由与状态**：TanStack Router + TanStack Query + IndexedDB 本地存储
- **样式与组件**：Tailwind CSS 4.3 + shadcn/ui (Radix UI) + Lucide Icons
- **代码质量**：Oxlint + Oxfmt

```text
.
├── src/
│   ├── components/         # 通用组件、AppLayout 响应式导航、GalleryLightbox 灯箱、RecipeDock
│   ├── routes/             # 页面路由：概览(index)、姿势(poses)、服装(costumes)、人像(portraits)、合成台(studio)、配置(settings)、指南(guide)
│   ├── services/           # AI 多协议图像生成客户端 (aiGenerator.ts) 与 Canvas 拼图合成 (canvasComposer.ts)
│   ├── store/              # 全局配方、生图状态与 IndexedDB 历史管理 (studioStore.tsx)
│   ├── lib/                # 数据加载器 (dataLoader.ts) 与 IndexedDB 工具 (idbStorage.ts)
│   └── types/              # 三库数据结构与 4 大 AI 协议类型定义 (gallery.ts)
├── data/
│   ├── pose.json / pose-zh.json                 # 姿势库日文原始数据 & 中文数据（1,439 条）
│   ├── costume.json / costume-zh.json           # 服装库日文原始数据 & 中文数据（1,440 条）
│   ├── portrait.json / portrait-zh.json         # 人像库日文原始数据 & 中文数据（1,466 条）
│   ├── *-meta-zh.json                           # 三库中文体系分类元数据
│   └── translations.csv                         # 日⇄中对照表（1,280 条）
├── thumbs/                 # 缩略图目录（姿势根目录 + costume/ + portrait/）
├── img/                    # 高清原图目录（姿势根目录 + costume/ + portrait/ + portrait/fullbody/）
├── scripts/
│   ├── download.py         # 三站并发下载器（断点续传 / 自动重试）
│   ├── i18n.py             # 日译中词典（1,280 条唯一译文）
│   ├── apply_translation.py# 生成三库 *-zh.json 中文数据与检索索引
│   ├── verify.py           # 校验 10,097 张图片完整性（存在性 / 大小 / 文件头）
│   └── build.sh            # 构建 Cloudflare Pages 发布目录 dist/
├── skills/                 # Claude Code / Agent 姿势检索技能包
└── README.md
```

---

## 本地开发与构建

需要 **Node.js 20+** 与 **pnpm**：

```bash
# 1. 安装依赖
pnpm install

# 2. 启动本地开发服务器（默认 http://localhost:5173）
pnpm dev

# 3. 类型检查 + 生产构建 + 代码规范检查
pnpm build && pnpm lint
```

### 数据与图片维护脚本（Python 3）

```bash
# 拉取/补全三站全部 10,097 张图片（已存在的文件自动跳过，支持断点续传）
python3 scripts/download.py
WORKERS=64 python3 scripts/download.py   # 调整并发线程数

# 修改 scripts/i18n.py 词典后，重新生成三库中文 JSON
python3 scripts/apply_translation.py

# 校验全部图片文件是否完整
python3 scripts/verify.py
```

---

## 部署到 Cloudflare Pages

本项目构建后为纯静态 SPA（所有 AI 接口请求均由浏览器端直连或通过您配置的 CORS 代理发出，无需后端服务器）。

### 方式一：GitHub 自动部署（推荐）

1. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 选择本仓库 → 生产分支 `main`
3. 构建设置：

   | 字段 | 值 |
   | --- | --- |
   | Framework preset | `None`（或 `Vite`） |
   | Build command | `bash scripts/build.sh` |
   | Build output directory | `dist` |

4. `scripts/build.sh` 会自动执行 `pnpm build`，并将 `data/`、`thumbs/`、`img/`、`_headers` 及 SPA 路由回退规则 `_redirects`（`/* /index.html 200`）打包至 `dist/`。

> **注意**：Cloudflare Pages 免费版单次部署文件上限为 20,000 个文件，单文件上限 25 MiB。本仓库共约 10,120 个文件、单文件最大 < 2 MB，完全符合限制。

### 方式二：Wrangler 命令行直传

```bash
bash scripts/build.sh
npx wrangler pages deploy dist --project-name ai-pose-gallery-zh
```

---

## 在 ComfyUI 中使用（双模式支持）

### 模式 A：作为 ComfyUI 原生插件安装（在 ComfyUI 画布内选图）

无需额外依赖（复用 ComfyUI 自带的 `torch`、`numpy`、`Pillow`、`aiohttp`）：

```bash
cd /path/to/ComfyUI/custom_nodes
git clone --depth 1 https://github.com/anhao/ai-pose-gallery-zh.git
```

重启 ComfyUI 后：
1. 在画布空白处右键 → **新建节点** → **AI角色三合一参考图集**；
2. 选择 **「AI 角色三合一合成配方 (3-in-1 Recipe)」** 或单个姿势 / 服装 / 人像节点；
3. 点击节点上的 **「🎨 打开三合一选图器 (4,345张)」** 按钮（或直接点击节点上的缩略图），即可在弹窗中按分类、视角、发长筛选或中文搜索，一键填入节点并输出 `IMAGE` 张量与中英文 Prompt。

### 模式 B：从 Web 合成台直连本地 ComfyUI API

如果您使用线上网页端（或本地 `pnpm dev`）选图，希望直接调用本机 ComfyUI 生图：
1. 启动本地 ComfyUI 时开启跨域参数：
   ```bash
   python main.py --enable-cors-header "*"
   ```
2. 打开本工作台 **「接口配置」** 页面 → 切换到 **「本地 ComfyUI」** → 点击「检测连接」（默认 `http://127.0.0.1:8188`）；
3. 可直接导入您在 ComfyUI 中通过 `工作流 -> 导出 (API)` 保存的 `.json` 文件，或在 **「合成台」** 一键导出内置通用工作流模板后点击生成。

---

## Agent 技能（Skills）

`skills/` 下提供 5 个 `SKILL.md` 格式的 Agent 技能，让 AI Agent 按姿势名 + 视角检索本仓库的白模图，作为生图 / 生视频的姿势参考：

| 技能 | 图片数 | 范围 |
| --- | ---: | --- |
| `pose-reference-standard` | 365 | 全身单人・标准系 |
| `pose-reference-upper` | 400 | 上半身单人 |
| `pose-reference-sexy` | 399 | 全身单人・性感系（18+） |
| `pose-reference-couple` | 275 | 双人缠绵（18+） |
| `pose-reference-all` | 1,439 | 全部姿势 |

```bash
git clone --depth 1 https://github.com/anhao/ai-pose-gallery-zh.git ~/ai-pose-gallery-zh
mkdir -p ~/.claude/skills
for d in ~/ai-pose-gallery-zh/skills/pose-reference-*; do ln -s "$d" ~/.claude/skills/; done
```

---

## 内容提示与版权致谢

- **内容提示**：图库包含部分成人向姿势与性感服装参考，仅供艺术创作、动作设计参考与前端技术学习使用，未成年人请勿访问。
- **版权归属**：所有姿势、服装、人像图片与原始数据的著作权归原作者 **ギア（@giaaibusi）** 所有。本仓库仅为汉化学习与前端工程实践存档，不对图片主张任何权利。
- **开源协议**：前端应用代码（`src/`）与数据处理脚本（`scripts/`）以 [MIT 协议](LICENSE) 开源；该协议**不覆盖** `img/`、`thumbs/` 与 `data/` 中的图片及原始数据。
