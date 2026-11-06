# ai-pose-gallery-zh

三大 AI 繪畫參考圖庫（姿勢 1,439 張、服裝 1,440 套、人像 1,466 位）與多協議「AI 角色合成台 (`/studio`)」Web 應用。

除雲端 API（Gemini / OpenAI GPT / 阿里千問 Qwen / 字節豆包 Seedream）外，合成台內建 **本地 ComfyUI（免 API Key）** 多圖角色合成支援，詳細架構與配置請先讀 [`docs/comfyui.md`](docs/comfyui.md)。

---

## 1. 本地 ComfyUI 生圖最小部署需求

若使用者只想在本專案的網頁介面（`/studio`）挑選「人像 + 服裝 + 姿勢」並交由本地 ComfyUI 生圖：

1. **最少需要的 Repo（2 個）**：
   - 本專案 [kime541200/ai-pose-gallery-zh](https://github.com/kime541200/ai-pose-gallery-zh)：提供圖庫與合成台前端，並透過內建 nginx 將 `/comfy/*` 反向代理至 ComfyUI。
   - [kime541200/comfyui-deploy](https://github.com/kime541200/comfyui-deploy)（若尚未自備 ComfyUI）：使用 `PROFILE=pose-gallery docker compose up -d --build` 啟動已內建 `comfyui_controlnet_aux`（含 `DepthAnythingV2Preprocessor`）與 `ComfyUI-GGUF` 的 ComfyUI 容器。
   - *(選配)* 若希望由 AI Agent 透過 MCP 自動檢索圖庫或管理 ComfyUI，可另外搭配 [kime541200/ai-pose-gallery-mcp](https://github.com/kime541200/ai-pose-gallery-mcp)、[kime541200/comfy-mcp](https://github.com/kime541200/comfy-mcp) 與 [kime541200/comfyui-agent](https://github.com/kime541200/comfyui-agent)。

2. **跨服務連線設定（`.env`）**：
   - 複製 `.env.example` 為 `.env`，依實際環境調整 `PORT`（預設 `8080`）與 `COMFYUI_UPSTREAM`（預設 `http://host.docker.internal:8188`）。
   - 啟動容器：`docker compose up -d --build`。

---

## 2. ComfyUI 必備模型與下載指引

合成台支援雙工作流引擎（於網頁 `/studio` →「工作流模板」切換），模型預檢、動態槽位裁剪與執行邏輯位於 [`src/services/aiGenerator.ts`](src/services/aiGenerator.ts)，工作流模板位於 [`src/workflows/`](src/workflows/)。

### 預設推薦：`FLUX 3 Image Klein Distilled (Int8)`（共 3 個檔案，約 10.27 GB）

對應模板 [`src/workflows/flux3-klein-edit.api.json`](src/workflows/flux3-klein-edit.api.json)。若使用者請 Agent 協助準備模型，請將下列 3 個檔案下載至 ComfyUI 的 `models/` 對應子目錄（公開免 Token 直連網址如下）：

| 目標相對路徑（`models/` 下） | 大小 | 免授權公開下載 URL |
| --- | --- | --- |
| `diffusion_models/flux3-image-klein-int8-convrot.safetensors` | 5.43 GB | `https://huggingface.co/ml-resources/flux-3-image-klein-comfy/resolve/main/diffusion_models/flux3-image-klein-int8-convrot.safetensors` |
| `text_encoders/qwen3vl_4b_int8_convrot.safetensors` | 4.52 GB | `https://huggingface.co/ml-resources/flux-3-image-klein-comfy/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors` |
| `vae/flux2-vae.safetensors` | 0.32 GB | `https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors` |

> **註**：
> - 官方源 `black-forest-labs/flux-3-image-klein-comfy` 為 Gated Repo（需 Hugging Face 帳號授權與 `HF_TOKEN`）；上表 `ml-resources/flux-3-image-klein-comfy` 為 SHA256 完全一致的公開鏡像，可直接以 `wget` / `curl` 或 [kime541200/comfy-mcp](https://github.com/kime541200/comfy-mcp) 的 `download_model` 下載。
> - 姿勢預處理節點 `DepthAnythingV2Preprocessor` 所需的 `depth_anything_v2_vitl.pth` 會在首次執行含姿勢圖的生圖時由 `comfyui_controlnet_aux` 自動下載，無須手動準備。

### 備選工作流：`Qwen-Image-Edit-2509`（共 4 個檔案，約 23.55 GB）

僅在使用者需要切換至 `Qwen-Image-Edit-2509`（模板 [`src/workflows/qwen-image-edit-2509.api.json`](src/workflows/qwen-image-edit-2509.api.json)）時才需下載，完整路徑與下載指令見 [`docs/comfyui.md`](docs/comfyui.md)。

---

## 3. 開發與維護規範

- **禁止寫死跨專案本機路徑**：程式碼、`docker-compose.yml` 與文件不可耦合 `../<other-repo>` 或特定本機絕對路徑；跨專案引用一律使用完整 GitHub URL（`https://github.com/kime541200/<repo>`），跨服務連線一律透過環境變數配置。
- **前端開發與驗證**：修改 `src/` 後執行 `pnpm build && pnpm lint` 確認型別與打包無誤；若以 Docker 運行，重新執行 `docker compose up -d --build web` 更新前端容器。
