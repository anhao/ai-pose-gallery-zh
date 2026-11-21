import type { ApiConfig, RecipeState } from '@/types/gallery'
import { poseImagePath, referenceImageUrl } from '@/lib/recipeImages'

type Progress = { stage: 'check' | 'upload' | 'queue' | 'running' | 'download'; message: string; percent?: number }
type SdCppModelFile = { id: string; name: string; category: string }
type SdCppRecipe = { id: string; slots: Array<{ id: string; required: boolean; categories?: string[]; category?: string }> }
type SdCppRuntime = { state?: 'empty' | 'loading' | 'ready' | 'error'; recipe?: string | null; error?: string | null }
type SdCppLora = { name: string; path: string; display_path?: string }

export const H3_CHARACTER_SWAP_LORA = 'h3_image_character_swap_v1.safetensors'

function endpoint(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

async function requestJson(baseUrl: string, path: string, init: RequestInit = {}, apiKey = '') {
  const headers = new Headers(init.headers)
  if (apiKey.trim()) headers.set('Authorization', `Bearer ${apiKey.trim()}`)
  const response = await fetch(endpoint(baseUrl, path), { ...init, headers })
  const text = await response.text()
  let data: any
  try { data = text ? JSON.parse(text) : {} } catch { data = { error: text.slice(0, 500) } }
  if (!response.ok) {
    const message = data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`
    throw new Error(`[SD.cpp] ${message}`)
  }
  return data
}

function findModelFile(files: SdCppModelFile[], category: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const found = files.find((file) => file.category === category && pattern.test(file.id))
    if (found) return found.id
  }
  return undefined
}

export function resolveH3ModelSelection(recipeId: 'minimax-h3-image' | 'p-h3-image', files: SdCppModelFile[]) {
  const isP = recipeId === 'p-h3-image'
  const selection: Record<string, string> = {}
  const required = {
    diffusion_model: findModelFile(files, 'diffusion_models', isP
      ? [/p-h3-image_int8_convrot/i, /p-h3-image_w4a8/i]
      : [/minimax_h3_image_pruned_int8_convrot/i, /minimax_h3_image_pruned_bf16/i]),
    llm: findModelFile(files, 'text_encoders', isP
      ? [/p-h3-image_text_encoder_int8_convrot/i, /p-h3-image_text_encoder_bf16/i, /p-h3-image_text_encoder_w4a8/i, /qwen3vl_4b_bf16/i]
      : [/p-h3-image_text_encoder_int8_convrot/i, /p-h3-image_text_encoder_bf16/i, /qwen3vl_32b_h3.*int8_convrot/i]),
    vae: findModelFile(files, 'vae', isP
      ? [/p-h3-image_vae_int8_convrot/i, /p-h3-image_vae_bf16/i]
      : [/minimax_h3_image_vae_fp16/i, /minimax_h3_image_vae/i]),
  }
  for (const [slot, file] of Object.entries(required)) if (file) selection[slot] = file
  const missing = Object.keys(required).filter((slot) => !selection[slot])
  if (missing.length) throw new Error(`sd-server 找不到 ${recipeId} 所需模型檔案：${missing.join(', ')}。請先下載相容權重或在 Model 視窗手動選擇。`)
  return selection
}

export async function ensureSdCppModelLoaded(baseUrl: string, apiKey: string, recipeId: 'minimax-h3-image' | 'p-h3-image', signal?: AbortSignal, onProgress?: (progress: Progress) => void) {
  const statusPath = '/sdcpp/v1/models/status'
  let status = await requestJson(baseUrl, statusPath, { signal }, apiKey) as SdCppRuntime
  if (status.state === 'ready' && status.recipe === recipeId) return status
  if (status.state === 'loading') {
    onProgress?.({ stage: 'check', message: 'sd-server 正在載入模型，等待完成…' })
    const started = Date.now()
    while (status.state === 'loading') {
      signal?.throwIfAborted()
      if (Date.now() - started > 30 * 60 * 1000) throw new Error('等待 sd-server 載入模型超時')
      await new Promise((resolve) => setTimeout(resolve, 1500))
      status = await requestJson(baseUrl, statusPath, { signal }, apiKey) as SdCppRuntime
    }
    if (status.state === 'ready' && status.recipe === recipeId) return status
  }

  onProgress?.({ stage: 'check', message: `自動準備 ${recipeId} 模型檔案…` })
  await requestJson(baseUrl, '/sdcpp/v1/models/refresh', { method: 'POST', signal }, apiKey)
  const [catalog, fileCatalog] = await Promise.all([
    requestJson(baseUrl, '/sdcpp/v1/recipes', { signal }, apiKey) as Promise<{ recipes: SdCppRecipe[] }>,
    requestJson(baseUrl, '/sdcpp/v1/model-files', { signal }, apiKey) as Promise<{ files: SdCppModelFile[] }>,
  ])
  if (!catalog.recipes?.some((item) => item.id === recipeId)) throw new Error(`目前 sd-server 沒有提供 ${recipeId} Built-in Recipe`)
  const models = resolveH3ModelSelection(recipeId, fileCatalog.files || [])
  onProgress?.({ stage: 'check', message: `自動載入 ${recipeId}（首次載入可能需要數分鐘）…` })
  status = await requestJson(baseUrl, '/sdcpp/v1/models/load', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipe: recipeId, models }), signal,
  }, apiKey) as SdCppRuntime
  if (status.state !== 'ready' || status.recipe !== recipeId) {
    throw new Error(status.error || `sd-server 無法載入 ${recipeId}，目前狀態：${status.state || 'unknown'}`)
  }
  return status
}

export async function testSdCppConnection(baseUrl: string, apiKey = ''): Promise<string> {
  const clean = baseUrl.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(clean)) throw new Error('請輸入完整的 HTTP(S) Server URL')
  const [capabilities, status] = await Promise.all([
    requestJson(clean, '/sdcpp/v1/capabilities', {}, apiKey),
    requestJson(clean, '/sdcpp/v1/models/status', {}, apiKey).catch(() => null),
  ])
  const runtime = status || capabilities.runtime
  const recipe = runtime?.recipe || 'command-line model'
  const state = runtime?.state || 'unknown'
  return `sd-server · ${state} · ${recipe} · ${capabilities.current_mode || 'image generation'}`
}

function round32(value: number) {
  return Math.max(64, Math.round(value / 32) * 32)
}

export function dimensionsFor(
  aspectRatio: string,
  resolution: string,
  limits: { max_width?: number; max_height?: number } = {},
) {
  const [rw, rh] = aspectRatio.split(':').map(Number)
  // `model` is a compatibility fallback for settings saved before the MP
  // selector was introduced. New installations default to 4 MP portrait.
  const pixels = resolution === 'model' ? 4_000_000 : Number(resolution) * 1_000_000
  const idealWidth = Math.sqrt(pixels * rw / rh)
  const idealHeight = Math.sqrt(pixels * rh / rw)
  // Respect the live server limits while preserving the requested aspect
  // ratio. Some sd-server builds cap each side at 4096 px, which means a
  // 9:16 request cannot physically reach 16 MP until that server limit rises.
  const maxWidth = limits.max_width ?? 4096
  const maxHeight = limits.max_height ?? 4096
  const scale = Math.min(1, maxWidth / idealWidth, maxHeight / idealHeight)
  const width = Math.min(maxWidth, round32(idealWidth * scale))
  const height = Math.min(maxHeight, round32(idealHeight * scale))
  return { width, height, requestedMegapixels: pixels / 1_000_000, actualMegapixels: width * height / 1_000_000, capped: scale < 1 }
}

export function sourceImages(recipe: RecipeState) {
  return [
    // UI order remains Portrait / Costume / Pose. The H3 prompt contract
    // maps Pose to Picture 1, Costume to Picture 2 and Portrait to Picture 3.
    recipe.pose && poseImagePath(recipe.pose),
    recipe.costume && (recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图),
    recipe.portrait && (recipe.portrait.原图 || recipe.portrait.缩略图),
    ...(recipe.extraImages || []).map((image) => image.url),
  ].filter(Boolean) as string[]
}

export function resolveH3CharacterSwapLora(loras: SdCppLora[]) {
  const lora = loras.find((item) => item.name === 'h3_image_character_swap_v1'
    || item.path.toLowerCase().endsWith(`/${H3_CHARACTER_SWAP_LORA.toLowerCase()}`)
    || item.path.toLowerCase() === H3_CHARACTER_SWAP_LORA.toLowerCase())
  if (!lora) throw new Error(`sd-server 找不到必要 LoRA：${H3_CHARACTER_SWAP_LORA}。請確認此檔案位於 models/loras/ 或 models/Lora/，再刷新模型目錄。`)
  return lora
}

export function buildH3LoraPayload(loras: SdCppLora[], strength = 1) {
  const lora = resolveH3CharacterSwapLora(loras)
  return [{ path: lora.path, multiplier: Number.isFinite(strength) ? strength : 1, is_high_noise: false }]
}

async function imageAsDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:image/')) return src
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = referenceImageUrl(src)
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error(`無法讀取參考圖片：${src.slice(0, 100)}`))
  })
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法建立圖片轉換 Canvas')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export async function generateWithSdCpp(params: {
  recipe: RecipeState
  prompt: string
  config: ApiConfig
  onProgress?: (progress: Progress) => void
  signal?: AbortSignal
}): Promise<{ imageUrl: string; modelUsed: string; providerUsed: 'sdcpp' }> {
  const { recipe, prompt, config, onProgress, signal } = params
  const provider = config.providers.sdcpp
  const baseUrl = (provider.baseUrl.trim() || 'http://127.0.0.1:1234').replace(/\/+$/, '')
  const apiKey = provider.apiKey.trim()
  const settings = config.sdcppParams
  const refs = sourceImages(recipe)
  if (!recipe.pose || !recipe.costume || !recipe.portrait) {
    throw new Error('H3 Character Swap 需要完整三張參考圖：人像、服裝及姿勢。Studio 順序保持不變，API 會自動改為 Pose → Costume → Portrait。')
  }
  if (refs.length > 16) throw new Error('SD.cpp 最多接受 16 張參考圖片')
  if (!prompt.trim() || prompt.startsWith('請先選擇或上傳')) throw new Error('請先選擇參考素材，或輸入自訂 Prompt')
  signal?.throwIfAborted()

  onProgress?.({ stage: 'check', message: '檢查 SD.cpp Server…' })
  const recipeId = provider.model === 'p-h3-image' ? 'p-h3-image' : 'minimax-h3-image'
  await ensureSdCppModelLoaded(baseUrl, apiKey, recipeId, signal, onProgress)
  const capabilities = await requestJson(baseUrl, '/sdcpp/v1/capabilities', { signal }, apiKey)
  if (refs.length && (capabilities.generation_features?.ref_images ?? capabilities.features?.ref_images) === false) {
    throw new Error('目前載入的模型不支援 Reference Images')
  }

  onProgress?.({ stage: 'upload', message: `準備 ${refs.length} 張獨立參考圖片…` })
  const refImages = await Promise.all(refs.map(imageAsDataUrl))
  signal?.throwIfAborted()
  const limits = capabilities.limits || {}
  const dimensions = dimensionsFor(settings.aspectRatio, settings.resolution, limits)
  const { width, height } = dimensions
  if (dimensions.capped) {
    onProgress?.({ stage: 'check', message: `Server 寬高上限 ${limits.max_width || 4096}×${limits.max_height || 4096} px；${dimensions.requestedMegapixels} MP 已限制為 ${width}×${height}（${dimensions.actualMegapixels.toFixed(2)} MP）` })
  }
  const loraPayload = buildH3LoraPayload((capabilities.loras || []) as SdCppLora[], settings.loraStrength)
  const recipeSteps = recipeId === 'p-h3-image' ? 8 : 6
  const sampleParams: Record<string, unknown> = {
    sample_method: settings.sampleMethod,
    sample_steps: recipeSteps,
    custom_sigmas: [],
    extra_sample_args: settings.extraSampleArgs.trim(),
    guidance: { txt_cfg: 1 },
  }
  const body = {
    prompt,
    width,
    height,
    seed: -1,
    batch_count: 1,
    ref_images: refImages,
    lora: loraPayload,
    sample_params: sampleParams,
    output_format: 'png',
    preview: 'none',
  }

  onProgress?.({ stage: 'queue', message: '提交 SD.cpp 生圖任務…' })
  const submitted = await requestJson(baseUrl, '/sdcpp/v1/img_gen', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
  }, apiKey)
  if (!submitted?.id) throw new Error('sd-server 未回傳有效的 Job ID')
  const jobUrl = submitted.poll_url || `/sdcpp/v1/jobs/${encodeURIComponent(submitted.id)}`
  const startedAt = Date.now()
  let cancelSent = false
  const cancel = () => {
    if (cancelSent) return
    cancelSent = true
    void requestJson(baseUrl, `/sdcpp/v1/jobs/${encodeURIComponent(submitted.id)}/cancel`, { method: 'POST' }, apiKey).catch(() => {})
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      signal?.throwIfAborted()
      if (Date.now() - startedAt > settings.timeoutSec * 1000) {
        cancel()
        throw new Error(`SD.cpp 生成超時（${settings.timeoutSec} 秒）`)
      }
      const job = await requestJson(baseUrl, jobUrl, {}, apiKey)
      const status = String(job.status || 'queued')
      const elapsed = Math.round((Date.now() - startedAt) / 1000)
      onProgress?.({ stage: 'running', message: `H3 Image · ${status} · ${elapsed}s`, percent: typeof job.progress === 'number' ? Math.round(job.progress * 100) : undefined })
      if (status === 'completed') {
        const image = job.result?.images?.[0]?.b64_json
        if (!image) throw new Error('sd-server 任務完成，但沒有回傳圖片資料')
        onProgress?.({ stage: 'download', message: '接收生成圖片…' })
        return { imageUrl: `data:image/${job.result?.output_format || 'png'};base64,${image}`, modelUsed: recipeId || provider.model, providerUsed: 'sdcpp' }
      }
      if (status === 'failed') throw new Error(job.error?.message || 'SD.cpp 生成失敗')
      if (status === 'cancelled') throw new DOMException('生成任務已取消', 'AbortError')
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, 1000)
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('生成任務已取消', 'AbortError')) }
        signal?.addEventListener('abort', onAbort, { once: true })
      })
    }
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}
