# 接上本地 ComfyUI 生圖（FLUX 3 Image Klein / Qwen-Image-Edit 3D 深度姿勢工作流）

「合成台 (`/studio`)」的 `本地 ComfyUI` 協議：把人像／服裝／姿勢（支援任意 1–3 張參考圖動態組合）交給本地 **FLUX 3 Image Klein Distilled（預設推薦）** 或 **Qwen-Image-Edit-2509** 執行多圖角色合成，完全免 API Key。

## 1. 工作流原理與特色

瀏覽器 → 同源 `/comfy/*`（Docker nginx 或 Vite dev proxy）或直連 ComfyUI：
`GET /object_info`（模型與節點預檢）→ `POST /upload/image` → `POST /prompt`（WebSocket 即時進度）→ `GET /history/{id}` → `GET /view`。

實作見 [`src/services/aiGenerator.ts`](../src/services/aiGenerator.ts)，除原生 FP8 工作流外，內建兩套專為 3D 素體姿勢圖優化的 API 工作流模板：
- [`src/workflows/flux3-klein-edit.api.json`](../src/workflows/flux3-klein-edit.api.json)（**預設推薦**：`FLUX 3 Image Klein Distilled (Int8)`，使用 `ReferenceMultiLatent` + `DepthAnythingV2Preprocessor`）
- [`src/workflows/qwen-image-edit-2509.api.json`](../src/workflows/qwen-image-edit-2509.api.json)（**備選**：`Qwen-Image-Edit-2509 (GGUF Q4_K_M)` + 4 步 Lightning LoRA + `DepthAnythingV2Preprocessor`）

> **任意 1–3 張參考圖自動裁剪（`pruneUnusedImageSlot`）**：
> 在使用上述兩套模板時，你不需要填滿全部 3 個槽位（例如只選「人像 + 姿勢」或「服裝 + 姿勢」），系統在提交前會自動移除未使用的 `LoadImage` 與下游預處理節點，並重新緊湊排列 `ReferenceMultiLatent` / `TextEncodeQwenImageEditPlus` 的圖片輸入。

### 為什麼姿勢圖會先經過 `DepthAnythingV2`？

本庫的姿勢參考圖是白底黑線的球形關節素體（含臉部十字線與關節球）。
- 若直接將素體圖作為像素參考送進多圖編輯模型，模型容易將它視為線稿控制（Lineart Control），把人偶關節球與臉部十字線直接畫進人物身上；
- 若改用傳統 `DWPose`（`yolox_l`）提取骨架，遇到仰視／俯視極限透視、倒立下腰或雙人交錯姿勢時，人體檢測器經常漏檢並輸出全黑骨架圖，導致前後朝向顛倒或退化為正面半身照。

因此工作流會在選取姿勢圖時，自動透過 `comfyui_controlnet_aux` 的 `DepthAnythingV2Preprocessor` 將白模轉為平滑立體的 **3D 灰階深度輪廓圖**（抹除素體內部關節線，同時完整保留前後景深、肢體交錯遮擋關係與鏡頭透視）。

---

## 2. ComfyUI 環境與模型需求

- **ComfyUI 版本**：`>= 0.43.0`（內建 `ReferenceMultiLatent`、`EmptyFlux2LatentImage`、`TextEncodeQwenImageEditPlus`、`CFGNorm`）
- **必備 Custom Nodes**（若使用 [kime541200/comfyui-deploy](https://github.com/kime541200/comfyui-deploy)，直接以 `PROFILE=pose-gallery docker compose up -d --build` 啟動即可自動裝妥）：
  - [`comfyui_controlnet_aux`](https://github.com/Fannovel16/comfyui_controlnet_aux)：提供 `DepthAnythingV2Preprocessor`（首次執行含姿勢圖的生圖時會自動拉取 `depth_anything_v2_vitl.pth` 預處理權重）
  - [`ComfyUI-GGUF`](https://github.com/city96/ComfyUI-GGUF)：僅在使用 `Qwen-Image-Edit-2509 (GGUF)` 模板時需要

### 方案 A（預設推薦）：`FLUX 3 Image Klein Distilled (Int8)`
16 GB 顯存可全程常駐 VRAM 不需 CPU Offload，16 步實測約 **35–45 秒／張**（共 3 個檔案，約 10.27 GB）：

| 路徑（相對於 ComfyUI `models/`） | 來源 Repo | 大小 |
| --- | --- | --- |
| `diffusion_models/flux3-image-klein-int8-convrot.safetensors` | `black-forest-labs/flux-3-image-klein-comfy`（或公開鏡像 `ml-resources/flux-3-image-klein-comfy`） | 5.43 GB |
| `text_encoders/qwen3vl_4b_int8_convrot.safetensors` | `black-forest-labs/flux-3-image-klein-comfy`（或公開鏡像 `ml-resources/flux-3-image-klein-comfy`） | 4.52 GB |
| `vae/flux2-vae.safetensors` | `Comfy-Org/flux2-dev` | 0.32 GB |

> **一鍵下載指令（免 Hugging Face Token 公開直連）**：
> 官方 `black-forest-labs/flux-3-image-klein-comfy` 為 Gated Repo（需登入授權並配置 `HF_TOKEN`）；下方指令使用 SHA256 完全一致的公開鏡像，可直接複製執行（請將 `COMFYUI_MODELS_DIR` 替換為你的 ComfyUI `models` 目錄，預設為 `/data/comfyui/models`）：
>
> ```bash
> COMFYUI_MODELS_DIR=${COMFYUI_MODELS_DIR:-/data/comfyui/models}
> mkdir -p "$COMFYUI_MODELS_DIR"/{diffusion_models,text_encoders,vae}
>
> wget -c -O "$COMFYUI_MODELS_DIR/diffusion_models/flux3-image-klein-int8-convrot.safetensors" \
>   "https://huggingface.co/ml-resources/flux-3-image-klein-comfy/resolve/main/diffusion_models/flux3-image-klein-int8-convrot.safetensors"
>
> wget -c -O "$COMFYUI_MODELS_DIR/text_encoders/qwen3vl_4b_int8_convrot.safetensors" \
>   "https://huggingface.co/ml-resources/flux-3-image-klein-comfy/resolve/main/text_encoders/qwen3vl_4b_int8_convrot.safetensors"
>
> wget -c -O "$COMFYUI_MODELS_DIR/vae/flux2-vae.safetensors" \
>   "https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors"
> ```

### 方案 B（備選工作流）：`Qwen-Image-Edit-2509 (GGUF)`
16 GB 顯存實測約 50–85 秒／張（搭配 4 步 Lightning LoRA，共 4 個檔案，約 23.55 GB）：

| 路徑（相對於 ComfyUI `models/`） | 來源 Repo | 大小 |
| --- | --- | --- |
| `unet/qwen-image-edit/Qwen-Image-Edit-2509-Q4_K_M.gguf` | `QuantStack/Qwen-Image-Edit-2509-GGUF` | 13.07 GB |
| `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors` | `Comfy-Org/Qwen-Image_ComfyUI` | 9.38 GB |
| `vae/qwen_image_vae.safetensors` | `Comfy-Org/Qwen-Image_ComfyUI` | 0.25 GB |
| `loras/qwen-image-edit/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | `lightx2v/Qwen-Image-Lightning` | 0.85 GB |

<details><summary>展開方案 B 下載指令</summary>

```bash
COMFYUI_MODELS_DIR=${COMFYUI_MODELS_DIR:-/data/comfyui/models}
mkdir -p "$COMFYUI_MODELS_DIR"/{unet/qwen-image-edit,text_encoders,vae,loras/qwen-image-edit}

wget -c -O "$COMFYUI_MODELS_DIR/unet/qwen-image-edit/Qwen-Image-Edit-2509-Q4_K_M.gguf" \
  "https://huggingface.co/QuantStack/Qwen-Image-Edit-2509-GGUF/resolve/main/Qwen-Image-Edit-2509-Q4_K_M.gguf"

wget -c -O "$COMFYUI_MODELS_DIR/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors" \
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors"

wget -c -O "$COMFYUI_MODELS_DIR/vae/qwen_image_vae.safetensors" \
  "https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors"

wget -c -O "$COMFYUI_MODELS_DIR/loras/qwen-image-edit/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors" \
  "https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Edit-2509/Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors"
```

</details>

---

## 3. Docker 部署與連線設定

- **Docker 部署本站**：
  ```bash
  cp .env.example .env
  # .env 預設 PORT=8080、COMFYUI_UPSTREAM=http://host.docker.internal:8188
  docker compose up -d --build
  ```
  - `web` 容器（nginx）提供前端與唯讀掛載的 `data/`、`thumbs/`、`img/`，並將 `/comfy/*` 同源反向代理至 `COMFYUI_UPSTREAM`（支援 WebSocket 即時進度推播，免設定 ComfyUI CORS）。
  - `proxy` 容器提供 `/api/proxy` 供雲端 API（千問／豆包）跨網域轉發。
- **本地開發模式**：
  ```bash
  COMFYUI_UPSTREAM=http://127.0.0.1:8188 pnpm dev
  ```

---

## 4. 周邊開源生態系（Containerized ComfyUI & AI Agent MCP）

如果你希望快速建置無污染的 GPU 容器環境，或讓 Claude Code、Cursor、Antigravity 等 AI Coding Agent 自動檢索本圖庫並驅動 ComfyUI 生圖，歡迎搭配以下開源專案使用與參與貢獻：

| 專案 Repo | 角色與功能說明 |
| --- | --- |
| **[kime541200/comfyui-deploy](https://github.com/kime541200/comfyui-deploy)** | **Docker 化 ComfyUI 部署環境**：支援依 Profile 將 custom nodes 烘進映像檔（避免依賴衝突）。使用 `PROFILE=pose-gallery docker compose up -d --build` 即可一鍵啟動預裝好 `comfyui_controlnet_aux` 與 `ComfyUI-GGUF` 的 ComfyUI 服務。 |
| **[kime541200/ai-pose-gallery-mcp](https://github.com/kime541200/ai-pose-gallery-mcp)** | **圖庫檢索與多圖合成 MCP Server**：為本圖庫提供 Streamable HTTP MCP 介面，支援繁／簡中文與口語同義詞模糊搜尋（`search_portraits` / `search_costumes` / `search_poses`），並可直接呼叫 ComfyUI 執行 `FLUX 3 Image Klein` 或 `Qwen-Image-Edit-2509` 角色合成（`generate_image`）。 |
| **[kime541200/comfyui-agent](https://github.com/kime541200/comfyui-agent)** | **AI Agent 生圖工作區（Studio Workspace）**：開箱即用的 Agent 工作區，整合 `ai-pose-gallery-mcp` 與 [kime541200/comfy-mcp](https://github.com/kime541200/comfy-mcp)，內建多套已驗證的 API 工作流模板與 Agent 操作規範。 |
| **[kime541200/lora-training](https://github.com/kime541200/lora-training)** | **Docker 化 LoRA 訓練工具**：封裝 kohya `sd-scripts` 與資料集自動打標／清理工具（`prep_dataset.py`、`fix_captions.py`），訓練出的角色 LoRA 可直接掛入 ComfyUI 驗證生圖。 |
