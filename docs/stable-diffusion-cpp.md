# SD.cpp：MiniMax H3 Image / P-H3-Image

AI Pose Gallery 以獨立 Provider 連接 `sd-server`，不經過 ComfyUI，也不需要在瀏覽器執行 CLI。

## Server 連線

1. 啟動 `sd-server`，例如監聽 `0.0.0.0:1234`。
2. 在 AI Pose Gallery「API 配置」選擇 **SD.cpp**。
3. 本機瀏覽器建議填 `http://127.0.0.1:1234`。`0.0.0.0` 是 Server 的監聽位址，不是建議的客戶端目的位址。
4. 點擊「檢測連線」。Studio 使用 `GET /sdcpp/v1/capabilities` 與 `GET /sdcpp/v1/models/status` 檢查 Server。

遠端 Server 可填 LAN URL 或 HTTPS Reverse Proxy URL。`sd-server` 原生 API 本身沒有 API Key 驗證；遠端部署請使用 VPN 或具備認證的 Reverse Proxy。設定欄位中的 API Key 僅用於向該 Proxy 傳送 Bearer Token。

## 自動載入 Built-in Recipe

一般生成不需要先手動開啟 sd-server 的 Model 視窗。Studio 在按下 Generate 時會先讀取 Server 狀態；若沒有載入模型、目前模型不是所選 H3 Recipe，或先前載入失敗，會自動刷新 Recipe / Model Files 目錄、解析相容權重並呼叫 `/sdcpp/v1/models/load`。首次載入可能需要數分鐘，生成進度會顯示自動載入狀態。若已載入正確 Recipe，則直接生成，不會重複載入。

自動選檔優先採用可用的 INT8 ConvRot 權重以降低記憶體需求，並使用 Server 回傳的 opaque file ID；缺少必要組件時會列出缺少的 slot，不會猜測不存在的路徑。

Studio 仍保留 Model 視窗，供手動切換 Recipe、選擇其他量化檔案或檢查模型目錄。

## Built-in Recipe 組件

在 Studio 的 Model 視窗選擇其中一個 Recipe：

- `minimax-h3-image`：MiniMax H3 Image diffusion model、相容的 Qwen3-VL text encoder、MiniMax H3 Image 2D VAE。
- `p-h3-image`：P-H3-Image diffusion model、相容的 Qwen3-VL text encoder / text connector、P-H3 Image VAE。

模型檔案清單和 slot 類別由 Server 動態提供。載入時使用 `/sdcpp/v1/recipes`、`/sdcpp/v1/model-files`、`/sdcpp/v1/models/load`；不在前端硬編碼本機權重路徑。Vision tower 與 P-H3 text connector 是否需要選取，依所選 encoder 的組件配置決定。

**VAE 必須與 Recipe 對應，不可互換。** 載入失敗時請查看 `sd-server` console log 的 component compatibility / memory 訊息。

## Studio 參數

| 項目 | MiniMax H3 Image | P-H3-Image |
|---|---:|---:|
| Built-in Recipe steps | 6 | 8 |
| CFG | 1 | 1 |
| 初始尺寸基準 | 約 1 MP | 約 1 MP |
| 尺寸倍數 | 32 px | 32 px |
| Reference Images | 最多 16 張 | 最多 16 張 |

Studio 預設使用以下取樣設定：

```text
--sampling-method lcm
--extra-sample-args noise_scale_start=1.1,noise_scale_end=0.9,noise_clip_std=0
```

原生 API 對應 `sample_params.sample_method` 與 `sample_params.extra_sample_args`。Studio 會依目前載入的 Recipe 設定 6 或 8 steps，並傳送 `custom_sigmas: []`，避免把 Built-in Recipe 的 Euler sigma schedule 與 LCM sampler 混用。若需要其他 sampler 或 extra args，可在 Studio「高級參數」修改。

### 比例與解析度

- 比例：`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`。
- 解析度：Model default、`0.25 MP`、`1 MP`、`2.25 MP`、`4 MP`。
- Studio 依比例與像素預算計算寬高，並對齊 32 px。

## 參考圖順序

Studio 會把各張圖轉成 PNG Data URL，獨立放入原生 API 的 `ref_images` 陣列，不會先合併成拼圖：

Studio 畫面中的素材槽順序不變：人像、服裝、姿勢。送往 sd-server 的 H3 `ref_images` 會重新排序：

1. Picture 1：姿勢（選取 Depth 時傳送對應深度圖）。
2. Picture 2：服裝。
3. Picture 3：人像。
4. Picture 4–16：附加參考圖，依加入順序排列。

Prompt 也會依同一順序標記 Picture 編號。沒有參考圖時可使用自訂 Prompt 進行 text-to-image。

## H3 專用 Prompt

MiniMax H3 Image 與 P-H3-Image 共用 `src/services/h3Prompt.ts` 的 H3 Prompt Builder。它把原專案的角色、服裝、姿勢與風格資訊轉寫成英文、完整的 reference-editing prose：先依上傳順序定義 `<Picture N>` 與對應的 `<Subject N>`，再說明最終畫面及每個 Subject 的作用，並清楚區分身份保留、服裝移植、姿勢借用與附加元素。風格預設也轉成可見的光線、材質、色彩與媒介描述。

其他 Provider 仍使用 `buildRecipePrompt()` 原有中文條列 Prompt，不會套用 H3 改寫。切換 Provider 時會清除前一 Provider 的手動 Prompt 覆寫，讓新 Provider 顯示其原生預設 Prompt；在同一 Provider 內編輯的自訂 Prompt 則會正常保留。

H3 Character Swap 使用 Studio 指定的固定 Prompt，並將 Pose / Costume / Portrait 分別對應 `<Picture 1>` / `<Picture 2>` / `<Picture 3>`。兩個 Built-in Recipe 都會自動附加 `h3_image_character_swap_v1.safetensors`，預設 multiplier 為 `1.0`，使用原生 `lora: [{path, multiplier, is_high_noise}]` 欄位，不使用 Prompt LoRA tag。LoRA 必須出現在 sd-server 的 `/sdcpp/v1/capabilities` 清單中。

H3 Prompt 寫作依據 MiniMax 官方 `h3-image-prompt-writing` Skill：

- [Prompt Writing Skill](https://github.com/MiniMax-AI/MiniMax-H3-Image/tree/main/skills/h3-image-prompt-writing)
- [Reference-image edit guide](https://github.com/MiniMax-AI/MiniMax-H3-Image/blob/main/skills/h3-image-prompt-writing/references/edit-en.txt)
- [Text-to-image guide](https://github.com/MiniMax-AI/MiniMax-H3-Image/blob/main/skills/h3-image-prompt-writing/references/t2i-en.txt)

## 任務處理

生成使用原生非同步 API：

- `POST /sdcpp/v1/img_gen`
- `GET /sdcpp/v1/jobs/{id}`
- `POST /sdcpp/v1/jobs/{id}/cancel`

Studio 輪詢 Job 狀態、保存生成結果至 IndexedDB，停止生成時向 Server 發送取消請求。生成超時可在高級參數設定。

## 限制

- Server 必須提供對應的 Built-in Recipe 及其必要權重；Studio 會在需要時自動載入。
- 遠端參考圖需要允許瀏覽器跨來源讀取，才能轉換為 Data URL 上傳。
- 單次最多 16 張參考圖；每張圖片在送出前縮放至最長邊不超過 2048 px。
- Server 的 CORS 與瀏覽器 Local Network Access 權限仍須允許 Studio 網頁來源連線。
