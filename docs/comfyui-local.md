# 本地 ComfyUI 三图合成（Qwen Image Edit 2509）

人像（图1：脸与身份）+ 服装（图2：款式、材质、颜色）+ 姿势（图3：动作与构图）→ 一张合成人物图。

## 所需模型（ComfyUI 官方 Comfy-Org/Qwen-Image_ComfyUI 仓库）

| 用途 | 文件 | 目录 | 大小 |
| --- | --- | --- | --- |
| 扩散模型 | `qwen_image_edit_2509_fp8_e4m3fn.safetensors` | `models/diffusion_models` 或 `models/unet` | 20.4 GB |
| 文本/视觉编码器 | `qwen_2.5_vl_7b_fp8_scaled.safetensors` | `models/text_encoders` | 9.4 GB |
| VAE | `qwen_image_vae.safetensors` | `models/vae` | 254 MB |
| 4 步加速 LoRA（2509 专用） | `Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors` | `models/loras` | 850 MB |

不需要任何自定义节点，ComfyUI 0.3.60 以上的内置节点即可（实测 0.43.0）。

## 工作流

`src/workflows/qwen_image_edit_2509_3img.api.json`（API 格式，可直接 `POST /prompt`，也可在合成台「导出 .json」）。

- `UNETLoader → LoraLoaderModelOnly(Lightning) → ModelSamplingAuraFlow(shift=3) → CFGNorm → KSampler(4 步, cfg=1, euler/simple)`，与官方模板一致。
- 三张图都送入 `TextEncodeQwenImageEditPlus`（视觉语言理解，按「图1/图2/图3」指代）。
- **只有人像和服装**通过 `ReferenceLatent` 作为像素级参考；姿势图只用于语义理解。
  实测如果把线稿人偶姿势图也作为像素参考，生成结果会照搬人偶的关节球和分块线条。
- 输出尺寸按姿势图比例缩放到约 1 MP（节点 10 的 `megapixels`）。
- cfg=1 时反向提示词不生效，「不要文字/水印」等要求写在正向提示词里。

旧的 Qwen-Image 2.1 预设仍保留，但需要另行安装 2.1 模型；合成台在提交前会检测并列出缺失的模型文件。

## 本地运行

```bash
corepack pnpm install
corepack pnpm dev
```

打开 http://localhost:5173/studio，接口协议选「本地 ComfyUI」。
本地运行时 ComfyUI 地址填 `/comfy`（默认值）：Vite 把 `/comfy/*` 同源代理到 `http://127.0.0.1:8000`，
因此不需要修改 ComfyUI 的 `--enable-cors-header`。ComfyUI 在其他端口时：

```bash
COMFYUI_URL=http://127.0.0.1:8188 corepack pnpm dev
```

直连（不经代理）时，ComfyUI 启动参数需要 `--enable-cors-header "<网页的来源>"`，该参数只能填一个来源。

## 显存与速度（RTX 4070 SUPER 12 GB / 32 GB 内存实测）

- 首次生成约 50 秒（含加载模型），之后每张约 25–30 秒。
- 20 GB 的 fp8 模型超过 12 GB 显存，ComfyUI 会自动部分卸载到内存，无需额外设置。
- 8 GB 显卡：把节点 10 的 `megapixels` 调到 0.6，关闭其他占用显卡的程序；显存不足时合成台会提示并调用 `/free` 释放显存。

## 已知限制

- 个别随机种子会在角落生成无意义的“标志”文字，换一个种子重新生成即可。
- 服装名称与图片不一致时（如名称写“牛仔”但图中是粉色），以图片为准，但不能保证每次都正确。
