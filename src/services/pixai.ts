import type { ApiConfig, PixAiParams, RecipeState } from '@/types/gallery'
import { poseImagePath, referenceImageUrl } from '@/lib/recipeImages'
import type { GenerationProgress } from './aiGenerator'

export const PIXAI_MODEL = '2024383379556065549'
export const PIXAI_FLASH_MODEL = '2050048243034896798'
export const PIXAI_MODELS = [{ value: PIXAI_MODEL, label: 'Tsubaki.3' }, { value: PIXAI_FLASH_MODEL, label: 'Tsubaki.3 Flash' }]
export const PIXAI_BASE_URL = 'https://api.pixai.art'
export const DEFAULT_PIXAI_PARAMS: PixAiParams = { aspectRatio: '3:4', size: '1k', mode: 'default', negativePrompt: '' }
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export interface PixAiTaskHandle {
  provider: 'pixai'
  taskId: string
  baseUrl: string
  model: string
  submittedAt: number
  useProxy: boolean
}
export interface PreparedPixAiGeneration {
  provider: 'pixai'
  baseUrl: string
  payload: ReturnType<typeof pixAiPayload>
}
export class PixAiRejectedError extends Error {}
export class PixAiTerminalError extends Error {}
export class PixAiUnknownError extends Error {
  constructor() { super('[PixAI] 提交结果未知：可能已创建任务并扣除额度。请在 PixAI 核对任务，勿重复提交。') }
}
class PixAiHttpError extends Error {
  status: number
  retryAfter: number
  constructor(status: number, message: string, retryAfter: number) {
    super(`[PixAI] HTTP ${status}：${message}`)
    this.status = status
    this.retryAfter = retryAfter
  }
}

// This first version deliberately pins the official origin. A restored handle must
// never send the currently configured key to an arbitrary persisted endpoint.
export function pixAiBaseUrl(value: string) {
  const base = (value.trim() || PIXAI_BASE_URL).replace(/\/+$/, '')
  if (base !== PIXAI_BASE_URL) throw new Error('[PixAI] 首版仅支持官方地址 https://api.pixai.art')
  return base
}
export function pixAiSources(recipe: RecipeState): [string, string, string] {
  if (!recipe.portrait || !recipe.costume || !recipe.pose) throw new Error('[PixAI] 请补齐人像、服装、姿势三张参考图')
  if (recipe.extraImages?.length) throw new Error('[PixAI] 最多支持三图，请先移除附加参考图')
  return [recipe.portrait.原图 || recipe.portrait.缩略图,
    recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图,
    poseImagePath(recipe.pose)]
}
export function pixAiPayload(prompt: string, params: PixAiParams, mediaIds: string[], model = PIXAI_MODEL) {
  if (!PIXAI_MODELS.some((entry) => entry.value === model)) throw new Error('[PixAI] 请选择 Tsubaki.3 或 Tsubaki.3 Flash')
  if (!prompt.trim() || prompt.length > 10000) throw new Error('[PixAI] 提示词须为 1–10000 字符')
  if (mediaIds.length !== 3 || mediaIds.some((id) => !id)) throw new Error('[PixAI] 必须按人像、服装、姿势上传三图')
  if (model === PIXAI_FLASH_MODEL && params.mode !== 'default') throw new Error('[PixAI] Flash 请使用模型默认模式')
  if (params.negativePrompt.length > 4096) throw new Error('[PixAI] 负向提示词不能超过 4096 字符')
  if (params.seed !== undefined && !Number.isSafeInteger(params.seed)) throw new Error('[PixAI] Seed 必须为安全整数')
  return { modelVersionId: model, prompt, contextImages: mediaIds,
    aspectRatio: params.aspectRatio, size: params.size, ...(params.mode === 'default' ? {} : { mode: params.mode }),
    ...(model === PIXAI_FLASH_MODEL ? {} : { negativePrompt: params.negativePrompt }), batchSize: 1, promptHelper: 'disable',
    ...(params.seed === undefined ? {} : { seed: params.seed }) }
}

/** Identify the actual raster bytes: some CDNs serve valid images as octet-stream. */
export async function pixAiImageMime(blob: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await blob.slice(0, 64).arrayBuffer())
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 8) === 'ftyp' && /avif|avis/.test(ascii(8, 64))) return 'image/avif'
  return null
}

export async function preparePixAiImage(src: string, label: string, signal?: AbortSignal): Promise<Blob> {
  try {
    let response: Response
    try { response = await fetch(referenceImageUrl(src), { signal }) } catch {
      signal?.throwIfAborted()
      throw new Error('无法读取素材；远程图片可能不允许跨域读取，可下载后上传到该槽位')
    }
    if (response.status === 404) throw new Error('素材文件不存在，请重新选择或上传图片；本地开发请检查图库素材是否已下载')
    if (!response.ok) throw new Error(`素材请求失败 HTTP ${response.status}`)
    if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) throw new Error('素材地址返回了网页而非图片，请检查素材文件是否缺失或地址是否正确')
    const blob = await response.blob()
    const mime = await pixAiImageMime(blob)
    if (!mime) throw new Error('未识别到有效的 PNG、JPEG、WebP、GIF 或 AVIF 图片数据')
    const bitmap = await createImageBitmap(blob.type === mime ? blob : blob.slice(0, blob.size, mime))
    let output = blob.type === mime ? blob : blob.slice(0, blob.size, mime)
    try {
      if (!bitmap.width || !bitmap.height) throw new Error('图片尺寸无效')
      // AVIF can be read by browsers but is not a PixAI upload MIME; transcode it.
      if (Math.max(bitmap.width, bitmap.height) >= 4000 || mime === 'image/avif') {
        const scale = Math.min(1, 3999 / Math.max(bitmap.width, bitmap.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.floor(bitmap.width * scale))
        canvas.height = Math.max(1, Math.floor(bitmap.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('无法处理图片')
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
        output = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('图片转换失败')), 'image/png'))
      }
    } finally { bitmap.close() }
    if (!output.size || output.size > MAX_IMAGE_BYTES) throw new Error('图片须小于等于 10 MiB，请压缩后重试')
    signal?.throwIfAborted()
    return output
  } catch (error) {
    signal?.throwIfAborted()
    throw new Error(`[PixAI] ${label}读取失败：${error instanceof Error ? error.message : '无法读取图片'}`)
  }
}

async function request(baseUrl: string, path: string, apiKey: string, useProxy: boolean, init: RequestInit = {}) {
  pixAiBaseUrl(baseUrl)
  if (!apiKey.trim()) throw new Error('[PixAI] 请配置 API Key')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${apiKey.trim()}`)
  const target = `${baseUrl}${path}`
  if (useProxy) headers.set('x-target-url', target)
  const response = await fetch(useProxy ? '/api/proxy' : target, { ...init, headers, redirect: 'error', cache: 'no-store', signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(60000)]) })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1500)
    const retry = response.headers.get('retry-after')
    const retryAfter = retry ? (Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0
    throw new PixAiHttpError(response.status, detail, Math.max(0, retryAfter || 0))
  }
  return response.json()
}
const delay = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted()
  const abort = () => { clearTimeout(timer); reject(signal?.reason) }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
  signal?.addEventListener('abort', abort, { once: true })
})

export async function resumePixAiTask(params: {
  task: PixAiTaskHandle; apiKey: string; signal?: AbortSignal; onProgress?: (progress: GenerationProgress) => void
}) {
  const { task, apiKey, signal, onProgress } = params
  pixAiBaseUrl(task.baseUrl)
  const deadline = Date.now() + 600000
  let backoff = 2000
  while (Date.now() < deadline) {
    signal?.throwIfAborted()
    let data
    try {
      data = await request(task.baseUrl, `/v1/task/${encodeURIComponent(task.taskId)}`, apiKey, task.useProxy, { signal })
      backoff = 2000
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof PixAiHttpError && error.status !== 429 && error.status < 500 && !(error.status === 404 && Date.now() - task.submittedAt < 60000)) throw error
      onProgress?.({ stage: 'queue', message: 'PixAI 查询中断，正在退避重试；任务记录已保留' })
      await delay(Math.min(Math.max(backoff, error instanceof PixAiHttpError ? error.retryAfter : 0), Math.max(0, deadline - Date.now())), signal)
      backoff = Math.min(backoff * 2, 30000)
      continue
    }
    if (data.status === 'failed' || data.status === 'cancelled') throw new PixAiTerminalError(`[PixAI] 任务 ${task.taskId} ${data.status}：${JSON.stringify(data.error || data.outputs || {}).slice(0, 1000)}`)
    if (data.status === 'completed') {
      onProgress?.({ stage: 'download', message: 'PixAI 生成完成，正在下载并保存图片…' })
      let url = data.outputs?.mediaUrls?.[0]
      if (!url && data.outputs?.mediaIds?.[0]) {
        const media = await request(task.baseUrl, `/v1/media/${encodeURIComponent(data.outputs.mediaIds[0])}`, apiKey, task.useProxy, { signal })
        url = media.urls?.find((entry: { variant: string }) => entry.variant === 'PUBLIC')?.url
      }
      if (typeof url !== 'string' || new URL(url).protocol !== 'https:') throw new Error(`[PixAI] 任务 ${task.taskId} 完成但没有有效图片：${JSON.stringify(data.outputs).slice(0, 1000)}`)
      // Never send the API key to a media CDN. Download errors retain the task.
      let response: Response
      try {
        response = await fetch(url, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(60000)]) })
      } catch {
        signal?.throwIfAborted()
        throw new Error(`[PixAI] 结果下载中断；任务 ${task.taskId} 已保留，可恢复重试`)
      }
      if (!response.ok) throw new Error(`[PixAI] 图片下载失败 HTTP ${response.status}；可恢复任务 ${task.taskId}`)
      const blob = await response.blob()
      if (!blob.type.startsWith('image/') || !blob.size) throw new Error('[PixAI] 下载结果不是有效图片；请恢复任务重试')
      const imageUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('[PixAI] 图片保存失败，请恢复任务重试'))
        reader.readAsDataURL(blob)
      })
      return { imageUrl, modelUsed: task.model, providerUsed: 'pixai' as const }
    }
    if (data.status !== 'waiting' && data.status !== 'running') throw new Error(`[PixAI] 未知任务状态 ${String(data.status)}，任务 ${task.taskId} 已保留`)
    onProgress?.({ stage: data.status === 'waiting' ? 'queue' : 'running', message: data.status === 'waiting' ? 'PixAI 排队中…' : 'PixAI 生成中…' })
    await delay(2000, signal)
  }
  throw new Error(`[PixAI] 查询超时；任务 ${task.taskId} 已保留，可稍后恢复`)
}

export async function generateWithPixAi(params: {
  recipe: RecipeState; prompt: string; config: ApiConfig; signal?: AbortSignal
  onProgress?: (progress: GenerationProgress) => void
  onSubmitting?: (prepared: PreparedPixAiGeneration) => Promise<void>
  onSubmitted?: (task: PixAiTaskHandle) => Promise<void>
}) {
  const { config, signal, onProgress } = params
  const baseUrl = pixAiBaseUrl(config.providers.pixai.baseUrl)
  const sources = pixAiSources(params.recipe)
  // Validate parameters before spending upload calls.
  pixAiPayload(params.prompt, config.pixaiParams, ['check', 'check', 'check'], config.providers.pixai.model)
  const mediaIds: string[] = []
  for (const [index, source] of sources.entries()) {
    const label = ['人像', '服装', '姿势'][index]
    onProgress?.({ stage: 'upload', message: `正在上传第 ${index + 1}/3 张：${label}…` })
    const blob = await preparePixAiImage(source, label, signal)
    const media = await request(baseUrl, '/v1/media/upload', config.providers.pixai.apiKey, config.useProxy, {
      method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal,
    })
    if (typeof media.id !== 'string' || !media.id) throw new Error(`[PixAI] ${label}上传没有返回 media ID`)
    mediaIds.push(media.id)
  }
  const payload = pixAiPayload(params.prompt, config.pixaiParams, mediaIds, config.providers.pixai.model)
  await params.onSubmitting?.({ provider: 'pixai', baseUrl, payload })
  signal?.throwIfAborted()
  onProgress?.({ stage: 'queue', message: '正在提交 PixAI 任务…' })
  const submittedAt = Date.now()
  let data
  try {
    // Creating a task is not idempotent: never retry this request.
    data = await request(baseUrl, '/v2/image/create', config.providers.pixai.apiKey, config.useProxy, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal,
    })
  } catch (error) {
    if (error instanceof PixAiHttpError && [400, 401, 403, 404, 413, 422, 429].includes(error.status)) throw new PixAiRejectedError(error.message)
    throw new PixAiUnknownError()
  }
  if (typeof data.id !== 'string' || !data.id) throw new PixAiUnknownError()
  const task: PixAiTaskHandle = { provider: 'pixai', taskId: data.id, baseUrl, model: payload.modelVersionId, submittedAt, useProxy: config.useProxy }
  try { await params.onSubmitted?.(task) } catch {
    throw new Error(`[PixAI] 任务已创建但记录保存失败。任务编号：${task.taskId}；请保留编号并恢复，勿重复提交。`)
  }
  await delay(2000, signal)
  return resumePixAiTask({ task, apiKey: config.providers.pixai.apiKey, signal, onProgress })
}
