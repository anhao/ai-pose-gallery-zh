import type { ApiConfig, ExtraReferenceImage, ImageProviderId, RecipeState } from '@/types/gallery'
import { applyWorkflowOverrides, getWorkflowImages, validateReferenceCombinations, workflowIdentity, type ComfyObjectInfo } from '@/lib/comfyWorkflowParameters'
import qwen2509ThreeImageWorkflow from '@/workflows/qwen_image_edit_2509_3img.api.json'

export interface ProviderModelOption {
  value: string
  label: string
}

export const PROVIDER_META: Record<
  ImageProviderId,
  {
    id: ImageProviderId
    name: string
    shortName: string
    defaultBaseUrl: string
    docUrl: string
    models: ProviderModelOption[]
  }
> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    docUrl: 'https://ai.google.dev/gemini-api/docs/image-generation',
    models: [
      { value: 'gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview' },
      { value: 'gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview' },
      { value: 'gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' },
      { value: 'gemini-2.5-flash-image-preview', label: 'gemini-2.5-flash-image-preview' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  gpt: {
    id: 'gpt',
    name: 'OpenAI GPT Image',
    shortName: 'GPT',
    defaultBaseUrl: 'https://api.openai.com/v1',
    docUrl: 'https://platform.openai.com/docs/guides/image-generation',
    models: [
      { value: 'gpt-image-2.5', label: 'gpt-image-2.5' },
      { value: 'gpt-image-2.5-sunburst', label: 'gpt-image-2.5-sunburst' },
      { value: 'gpt-image-2.5-flare', label: 'gpt-image-2.5-flare' },
      { value: 'gpt-image-2', label: 'gpt-image-2' },
      { value: 'gpt-image-1.5', label: 'gpt-image-1.5' },
      { value: 'gpt-image-1', label: 'gpt-image-1' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  qwen: {
    id: 'qwen',
    name: '阿里云百炼 Qwen',
    shortName: 'Qwen',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com',
    docUrl: 'https://help.aliyun.com/zh/model-studio/qwen-image-edit-api',
    models: [
      { value: 'qwen-image-3.0-pro', label: 'qwen-image-3.0-pro' },
      { value: 'qwen-image-2.1-pro', label: 'qwen-image-2.1-pro' },
      { value: 'qwen-image-2.1-turbo', label: 'qwen-image-2.1-turbo' },
      { value: 'qwen-image-2.0-pro', label: 'qwen-image-2.0-pro' },
      { value: 'qwen-image-edit-plus', label: 'qwen-image-edit-plus' },
      { value: 'custom', label: '自定义模型 ID' },
    ],
  },
  doubao: {
    id: 'doubao',
    name: '字节火山方舟 Doubao',
    shortName: 'Doubao',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    docUrl: 'https://www.volcengine.com/docs/82379/1541523',
    models: [
      { value: 'doubao-seedream-5-0', label: 'doubao-seedream-5-0' },
      { value: 'doubao-seedream-5-0-lite', label: 'doubao-seedream-5-0-lite' },
      { value: 'doubao-seedream-4-5-251128', label: 'doubao-seedream-4-5-251128' },
      { value: 'doubao-seedream-4-0-250828', label: 'doubao-seedream-4-0-250828' },
      { value: 'doubao-seededit-3-0-i2i-250628', label: 'doubao-seededit-3-0-i2i-250628' },
      { value: 'custom', label: '自定义模型 ID / Endpoint' },
    ],
  },
  comfyui: {
    id: 'comfyui',
    name: '本地 ComfyUI',
    shortName: 'ComfyUI',
    // 本地开发时走 /comfy 同源代理；线上站点直连 ComfyUI Desktop 默认端口 8000
    defaultBaseUrl: defaultComfyBaseUrl(),
    docUrl: 'https://docs.comfy.org/essentials/comfyui_server',
    models: [
      { value: 'qwen_image_edit_2509', label: 'qwen_image_edit_2509（由工作流决定）' },
      { value: 'custom', label: '自定义名称（仅用于记录显示）' },
    ],
  },
}

export const STYLE_PRESETS: Record<string, { label: string; prompt: string }> = {
  none: {
    label: '无预设（跟随参考图）',
    prompt: '',
  },
  realistic: {
    label: '写实人像写真',
    prompt: '写实商业摄影级质感，85mm 人像镜头，自然柔和光影，真实肌肤纹理与织物细节，8k 高清画质。',
  },
  fashion: {
    label: '日韩杂志画报',
    prompt: '日韩时尚穿搭杂志画报风格，干净极简摄影棚背景，高级色调，突出人物颜值与服装剪裁。',
  },
  film: {
    label: '复古胶片写真',
    prompt: '35mm 富士胶片摄影质感，轻微胶片颗粒，柔和复古暖调，自然街拍光影与电影呼吸感。',
  },
  semi_real: {
    label: '2.5D 游戏原画立绘',
    prompt: '2.5D 半写实高精度游戏角色原画，唯美厚涂光影，精致五官与华丽布料金属质感。',
  },
  anime: {
    label: '日系二次元插画',
    prompt: '日系精致二次元插画风格，细腻赛璐璐与厚涂光影过渡，动漫角色立绘质感，色彩通透干净。',
  },
  cel_anime: {
    label: '新海诚感动画电影',
    prompt: '动画电影级画面质感，清澈高饱和光影，细腻体积光与发丝高光，干净唯美的动漫色彩。',
  },
  manga: {
    label: '日式黑白漫画网点',
    prompt: '日本黑白漫画原稿风格，利落精准的G笔线稿，细腻漫画网点纸阴影与层次对比。',
  },
  render3d: {
    label: '3D 次世代角色渲染',
    prompt: 'Unreal Engine 5 / Octane Render 次世代 3D 角色渲染，细腻次表面散射肌肤材质，电影级布光。',
  },
  chibi_box: {
    label: '3D 潮玩手办质感',
    prompt: '高品质 PVC 涂装完成品手办质感，柔和摄影棚柔光箱布光，精致材质高光与微距景深。',
  },
  cyberpunk: {
    label: '赛博朋克霓虹',
    prompt: '赛博朋克科幻视觉风格，雨夜霓虹冷暖双色轮廓光，未来感材质反光与电影级氛围。',
  },
  concept_sheet: {
    label: '角色设定集立绘（纯白底）',
    prompt: '标准角色设定集全身立绘，纯白干净无杂物背景，均匀漫反射布光，清晰展示全身服装结构与配饰细节。',
  },
}

// 按实际传入模型的图片顺序动态生成「图1 / 图2 / 图3...」明确指代，支持附加上传图片
// 用自然语言逐项描述（人物 / 服装 / 姿势），实测比堆砌要点更能让多图编辑模型还原服装、避免照搬人体模型线条
const PHOTO_STYLES = new Set(['realistic', 'fashion', 'film'])

export function buildRecipePrompt(recipe: RecipeState, stylePreset = 'realistic', workflowImages: ExtraReferenceImage[] = []): string {
  const styleInfo = STYLE_PRESETS[stylePreset] ?? STYLE_PRESETS.realistic
  const isPhoto = PHOTO_STYLES.has(stylePreset)
  const faceless = !recipe.portrait && !workflowImages.some((image) => image.role === 'character_sheet') && Boolean(recipe.costume && recipe.pose)
  const clauses: string[] = []
  let idx = 1
  let costumeIdx = 0

  workflowImages.filter((image) => image.role === 'character_sheet').forEach(() => {
    clauses.push('• 角色设定参考：提供的设定集展示同一角色的多个视角与细节，不是多个不同人物。保持角色的脸型、五官、发型、发色、肤色及服装配饰一致；只把它作为角色参考，成品布局遵循当前工作流的输出设置。')
    idx++
  })

  if (recipe.portrait) {
    const hairDesc =
      recipe.portrait.发型名称 && recipe.portrait.发型名称 !== '标准基础款'
        ? recipe.portrait.标题
        : recipe.portrait.发长
    const skin = '人物的肤色必须与图一人物一致，所有裸露皮肤（包括服装镂空处露出的皮肤）必须与脸部肤色统一，统一后的肤色与质感按风格要求呈现。'
    const outfit = recipe.costume ? '' : '保留图1人物原有可见服装与配饰，不复制姿势参考图的服装或白模外观。'
    clauses.push(
      recipe.portrait.source === 'upload'
        ? `• 人物：图${idx}中的人物，保持其脸型、五官、发型和发色一致。${skin}${outfit}`
        : `• 人物：图${idx}中的人物，保持其脸型、五官、发型（${hairDesc}）和发色一致。${skin}${outfit}`
    )
    idx++
  }
  if (recipe.costume) {
    costumeIdx = idx
    clauses.push(
      recipe.costume.source === 'upload'
        ? `• 服装：让人物穿上图${idx}中展示的整套服装和配饰，每件单品的颜色、款式、面料与配饰都以图${idx}为准。`
        : `• 服装：让人物穿上图${idx}中展示的整套服装和配饰（参考名称：${recipe.costume.服装名称}），每件单品的颜色、款式、面料与配饰都以图${idx}为准，名称仅作辅助说明。`
    )
    idx++
  }
  if (recipe.pose) {
    const wear = costumeIdx ? `，穿着图${costumeIdx}的服装` : ''
    const body = isPhoto
      ? `最终画面中的人物是真人，皮肤真实自然${wear}`
      : `人物的肤色与质感按风格要求呈现${wear}`
    clauses.push(
      recipe.pose.source === 'upload'
        ? `• 姿势：按照图${idx}中的人物动作和镜头角度摆姿势；仅参考姿势与构图，不复制图${idx}人物的外观与服装，${body}。`
        : `• 姿势：按照图${idx}中人体模型的动作和镜头角度摆姿势（${recipe.pose.姿势名称}，${recipe.pose.角度}）；图${idx}只是动作示意，${body}。`
    )
    idx++
  }
  if (faceless) {
    clauses.push('• 无脸展示：生成一位穿着参考服装的成年展示人物，脸部保持无五官的自然肤色表面，不添加眼睛、鼻子、嘴巴或具体人物身份；全身裸露皮肤的颜色统一，不照搬服装图或姿势图的灰白人台材质。')
  }
  for (const reference of workflowImages.filter((image) => image.role !== 'character_sheet')) {
    clauses.push(`• 工作流参考：参考图${idx}（${reference.name || '补充参考'}）中的相关元素，具体用途以工作流要求为准。`)
    idx++
  }
  for (const extra of recipe.extraImages || []) {
    clauses.push(
      `• 附加参考：融合图${idx}（${extra.name || '补充元素'}）中的元素、配饰、背景或光影细节。`
    )
    idx++
  }

  if (clauses.length === 0) {
    return '请先选择人像/服装/姿势或上传附加参考图。'
  }

  const lines = [
    `请根据${workflowImages.some((image) => image.role === 'character_sheet') ? '提供的角色设定参考' : `提供的 ${idx - 1} 张参考图`}，生成一张完整的${faceless ? '人物穿搭展示图' : isPhoto ? '真实人物照片' : '人物图像'}：`,
    ...clauses,
  ]
  if (styleInfo.prompt) {
    lines.push(`• 风格：${styleInfo.prompt} ${faceless ? '人物比例协调，手部自然，脸部无五官，光影统一。' : '人物比例协调，手部与五官自然，光影统一。'}`)
  }
  lines.push('画面中没有任何文字、标志或水印。')
  return lines.join('\n')
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxSide = 1024
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale)
        c.height = Math.round(img.height * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/png'))
      }
      img.onerror = () => reject(new Error('解析图片失败'))
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`加载图片失败: ${src}`))
    if (src.startsWith('data:') || /^https?:\/\//i.test(src) || src.startsWith('/')) {
      img.src = src
    } else {
      img.src = `/${src}`
    }
  })
}

export async function stitchRecipeCanvas(recipe: RecipeState): Promise<string> {
  const list: Array<{ tag: string; sub: string; src: string }> = []
  let idx = 1

  if (recipe.portrait) {
    list.push({
      tag: `图${idx++} · 人像`,
      sub: recipe.portrait.标题,
      src: recipe.portrait.原图 || recipe.portrait.缩略图,
    })
  }
  if (recipe.costume) {
    list.push({
      tag: `图${idx++} · 服装`,
      sub: `${recipe.costume.分类} · ${recipe.costume.服装名称}`,
      src: recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图,
    })
  }
  if (recipe.pose) {
    list.push({
      tag: `图${idx++} · 姿势`,
      sub: `${recipe.pose.姿势名称}（${recipe.pose.角度}）`,
      src: recipe.pose.原图 || recipe.pose.缩略图,
    })
  }
  for (const extra of recipe.extraImages || []) {
    list.push({
      tag: `图${idx++} · 附加`,
      sub: extra.name || '自定义参考图',
      src: extra.url,
    })
  }

  if (!list.length) {
    throw new Error('请至少选择或上传 1 张参考图')
  }

  const imgs = await Promise.all(list.map((x) => loadImage(x.src)))
  const cardW = 480
  const cardH = 640
  const pad = 20
  const headH = 62
  const canvas = document.createElement('canvas')
  canvas.width = list.length * cardW + (list.length + 1) * pad
  canvas.height = cardH + headH + pad * 2
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#111318'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  imgs.forEach((img, i) => {
    const x = pad + i * (cardW + pad)
    const y = pad
    ctx.fillStyle = '#1e222b'
    ctx.fillRect(x, y, cardW, cardH + headH)
    ctx.fillStyle = '#f4f5f7'
    ctx.fillRect(x, y + headH, cardW, cardH)

    const scale = Math.min(cardW / img.width, cardH / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, x + (cardW - dw) / 2, y + headH + (cardH - dh) / 2, dw, dh)

    ctx.fillStyle = '#a1a1aa'
    ctx.font = '600 12px Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillText(list[i].tag, x + 14, y + 23)

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 15px Inter, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'
    ctx.fillText(list[i].sub.slice(0, 26), x + 14, y + 46)
  })

  return canvas.toDataURL('image/jpeg', 0.92)
}

// 将本地相对路径自动解析为公网可访问的 HTTPS URL
// - 若当前站点已部署在公网 HTTPS 域名，优先使用当前站点 URL
// - 若在 localhost 本地开发，自动映射为三大图库对应的 Cloudflare Pages 公网源站 CDN URL
export function toPublicHttpsUrl(src: string): string {
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src
  const clean = src.replace(/^\/+/, '')

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname)
  ) {
    return `${window.location.origin}/${clean}`
  }

  // 本地开发态自动映射为源站 Cloudflare Pages 公网 HTTPS 地址，方便云端生图接口直接拉取
  if (clean.startsWith('img/portrait/')) {
    const filename = clean.slice('img/portrait/'.length).replace(/\.webp$/i, '.png')
    return `https://ai-portrait-gallery.pages.dev/img/${filename}`
  }
  if (clean.startsWith('thumbs/portrait/')) {
    return `https://ai-portrait-gallery.pages.dev/thumbs/${clean.slice('thumbs/portrait/'.length)}`
  }
  if (clean.startsWith('img/costume/') || clean.startsWith('thumbs/costume/')) {
    return `https://ai-costume-gallery.pages.dev/${clean}`
  }
  return `https://ai-pose-gallery.pages.dev/${clean}`
}

async function srcToPngDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:image/')) return src
  const img = await loadImage(src)
  const maxSide = 1024
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

async function smartFetch(
  targetUrl: string,
  init: RequestInit,
  useProxy: boolean
): Promise<Response> {
  if (!useProxy) {
    return fetch(targetUrl, init)
  }
  const headers = new Headers(init.headers)
  headers.set('x-target-url', targetUrl)
  return fetch('/api/proxy', {
    method: init.method || 'POST',
    headers,
    body: init.body,
  })
}

function extractUniversalImage(json: any): string | null {
  // 1. OpenAI / Doubao Seedream standard: data[0].b64_json or data[0].url
  if (json?.data?.[0]?.b64_json) return `data:image/png;base64,${json.data[0].b64_json}`
  if (json?.data?.[0]?.url) return json.data[0].url

  // 2. OpenAI Responses API output[].result
  if (Array.isArray(json?.output)) {
    for (const item of json.output) {
      if (item?.type === 'image_generation_call' && item?.result) {
        return `data:image/png;base64,${item.result}`
      }
    }
  }

  // 3. Alibaba DashScope Qwen-Image: output.choices[0].message.content[].image or output.results[0].url
  const dashContent = json?.output?.choices?.[0]?.message?.content
  if (Array.isArray(dashContent)) {
    for (const part of dashContent) {
      if (part?.image) return part.image
    }
  }
  if (json?.output?.results?.[0]?.url) return json.output.results[0].url

  // 4. Google Gemini generateContent: candidates[0].content.parts[].inlineData
  const parts = json?.candidates?.[0]?.content?.parts || []
  for (const p of parts) {
    if (p.inlineData?.data) return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`
    if (p.inline_data?.data) return `data:${p.inline_data.mime_type || 'image/png'};base64,${p.inline_data.data}`
  }

  // 5. OpenAI Chat Completions multimodal / markdown image
  const msg = json?.choices?.[0]?.message
  if (Array.isArray(msg?.images) && msg.images[0]?.image_url?.url) return msg.images[0].image_url.url
  if (Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part.type === 'image_url' && part.image_url?.url) return part.image_url.url
      if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
    }
  }
  const text = typeof msg?.content === 'string' ? msg.content : ''
  const mdMatch = text.match(/!\[.*?\]\((data:image\/[^)]+|https?:\/\/[^\s)]+)\)/)
  if (mdMatch) return mdMatch[1]
  const urlMatch = text.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)[^\s"'<>]*)/i)
  if (urlMatch) return urlMatch[1]

  return null
}

// ============================================================================
// 本地 ComfyUI API 工作流模板与节点解析工具
// ============================================================================

type ComfyNode = { class_type: string; inputs: Record<string, any>; _meta?: { title?: string; studio?: { imageRole?: string } } }
type ComfyWorkflow = Record<string, ComfyNode>

export type ComfyPresetId = 'qwen2509_3img' | 'qwen2509_2img' | 'qwen21_3img' | 'qwen21_2img'

export interface ComfyNodeMappings {
  promptNodeId: string
  portraitNodeId: string
  costumeNodeId: string
  poseNodeId: string
  stitchedNodeId: string
}

/** 本地开发 / 本地预览时使用的同源代理前缀（见 vite.config.ts），可绕开 ComfyUI 的 CORS 白名单限制 */
export const COMFY_DEV_PROXY = '/comfy'

export function isLocalDevHost(): boolean {
  return (
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
  )
}

/** ComfyUI Desktop 默认端口 8000；便携版 / 源码版默认 8188 */
// 注意：PROVIDER_META 在模块初始化时就会调用本函数，这里不能引用后面定义的 const
export function defaultComfyBaseUrl(): string {
  return isLocalDevHost() ? '/comfy' : 'http://127.0.0.1:8000'
}

export function comfyCandidateUrls(current = ''): string[] {
  const list = [
    current.trim(),
    isLocalDevHost() ? defaultComfyBaseUrl() : '',
    'http://127.0.0.1:8000',
    'http://127.0.0.1:8188',
  ]
    .map((x) => x.replace(/\/+$/, ''))
    .filter(Boolean)
  return Array.from(new Set(list))
}

function cloneWorkflow<T>(wf: T): T {
  return JSON.parse(JSON.stringify(wf))
}

// 双图版：图1 = 人物（含服装），图2 = 姿势（姿势图只送入视觉语言编码器，不作为像素参考）
function buildQwen2509TwoImage(): ComfyWorkflow {
  const wf = cloneWorkflow(qwen2509ThreeImageWorkflow) as ComfyWorkflow
  for (const id of ['2', '22', '23', '25', '27']) delete wf[id]
  wf['1']._meta = { title: '图1：人物/服装参考 (Person)' }
  wf['3']._meta = { title: '图2：姿势参考 (Pose)' }
  for (const id of ['12', '13']) {
    wf[id].inputs.image2 = ['3', 0]
    delete wf[id].inputs.image3
  }
  wf['14'].inputs.positive = ['24', 0]
  wf['14'].inputs.negative = ['26', 0]
  return wf
}

// 旧版 Qwen-Image 2.1 预设（需要另行安装 2.1 模型；默认已改用本机可用的 Edit 2509）
function buildQwen21Workflow(threeImages: boolean): ComfyWorkflow {
  const wf: ComfyWorkflow = {
    '1': {
      inputs: { image: 'portrait_ref.png' },
      class_type: 'LoadImage',
      _meta: { title: threeImages ? '图1：人像参考 (Portrait)' : '图2：人物/服装参考图 (Person)' },
    },
    '4': {
      inputs: { unet_name: 'image2image/qwen_image_2.1_bf16.safetensors', weight_dtype: 'default' },
      class_type: 'UNETLoader',
      _meta: { title: '加载 Qwen Image 2.1 基础模型' },
    },
    '5': {
      inputs: {
        model: ['4', 0],
        lora_name: 'qwen2.1/动作编辑VNCCS_QI2_PoseStudioV2_3294845.safetensors',
        strength_model: 1.0,
      },
      class_type: 'LoraLoaderModelOnly',
      _meta: { title: '加载姿态编辑 LoRA 适配器 (Qwen 2.1 专用)' },
    },
    '6': {
      inputs: { device: 'auto', dtype: 'default', model: ['5', 0] },
      class_type: 'QwenImage21Cache',
      _meta: { title: 'Qwen Image 2.1 条件缓存' },
    },
    '7': {
      inputs: { clip_name: 'text_encoders/qwen3vl_8b_bf16.safetensors', type: 'qwen_image', device: 'default' },
      class_type: 'CLIPLoader',
      _meta: { title: '加载 Qwen3-VL 8B 编码器' },
    },
    '8': {
      inputs: { vae_name: 'vae/qwen_image_2.1_vae_bf16.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: '加载 Qwen Image 2.1 VAE' },
    },
    '9': {
      inputs: {
        prompt: '',
        negative_prompt: '',
        resolution: 1024,
        clip: ['7', 0],
        vae: ['8', 0],
      },
      class_type: 'TextEncodeQwenImage21',
      _meta: { title: '正向提示词与多图编码 (Qwen 2.1)' },
    },
    '10': {
      inputs: {
        seed: 20261031,
        steps: 25,
        cfg: 1.0,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1.0,
        model: ['6', 0],
        positive: ['9', 0],
        negative: ['9', 1],
        latent_image: ['9', 2],
      },
      class_type: 'KSampler',
      _meta: { title: 'KSampler 采样器' },
    },
    '11': {
      inputs: { samples: ['10', 0], vae: ['8', 0] },
      class_type: 'VAEDecode',
      _meta: { title: 'VAE 解码' },
    },
    '12': {
      inputs: { filename_prefix: 'pose_studio/result', images: ['11', 0] },
      class_type: 'SaveImage',
      _meta: { title: '保存生成结果' },
    },
  }
  if (threeImages) {
    wf['2'] = { inputs: { image: 'costume_ref.png' }, class_type: 'LoadImage', _meta: { title: '图2：服装参考 (Costume)' } }
    wf['3'] = { inputs: { image: 'pose_ref.png' }, class_type: 'LoadImage', _meta: { title: '图3：姿势参考 (Pose)' } }
    Object.assign(wf['9'].inputs, { 'images.image_1': ['1', 0], 'images.image_2': ['2', 0], 'images.image_3': ['3', 0] })
  } else {
    wf['2'] = { inputs: { image: 'pose_reference.png' }, class_type: 'LoadImage', _meta: { title: '图1：姿势参考图 (Pose)' } }
    Object.assign(wf['9'].inputs, { 'images.image_1': ['2', 0], 'images.image_2': ['1', 0] })
  }
  return wf
}

export const DEFAULT_COMFY_PRESET: ComfyPresetId = 'qwen2509_3img'

export const COMFYUI_WORKFLOW_TEMPLATES: Record<
  ComfyPresetId,
  { label: string; workflow: ComfyWorkflow; defaults: ComfyNodeMappings }
> = {
  qwen2509_3img: {
    label: 'Qwen Image Edit 2509 三图合成（人像+服装+姿势）· 推荐',
    workflow: qwen2509ThreeImageWorkflow as ComfyWorkflow,
    defaults: { promptNodeId: '12', portraitNodeId: '1', costumeNodeId: '2', poseNodeId: '3', stitchedNodeId: 'none' },
  },
  qwen2509_2img: {
    label: 'Qwen Image Edit 2509 双图姿态迁移（人物+姿势）',
    workflow: buildQwen2509TwoImage(),
    defaults: { promptNodeId: '12', portraitNodeId: '1', costumeNodeId: 'none', poseNodeId: '3', stitchedNodeId: 'none' },
  },
  qwen21_3img: {
    label: 'Qwen-Image 2.1 三图合成（需另装 2.1 模型）',
    workflow: buildQwen21Workflow(true),
    defaults: { promptNodeId: '9', portraitNodeId: '1', costumeNodeId: '2', poseNodeId: '3', stitchedNodeId: 'none' },
  },
  qwen21_2img: {
    label: 'Qwen-Image 2.1 双图姿态迁移（需另装 2.1 模型）',
    workflow: buildQwen21Workflow(false),
    defaults: { promptNodeId: '9', portraitNodeId: '1', costumeNodeId: 'none', poseNodeId: '2', stitchedNodeId: 'none' },
  },
}

export interface ComfyParsedNodes {
  valid: boolean
  isUiFormat: boolean
  error?: string
  imageNodes: Array<{ id: string; title: string; classType: string; currentImage: string; emptyValue?: string; role?: 'character_sheet' }>
  promptNodes: Array<{ id: string; title: string; classType: string; field: string }>
}

export function parseComfyWorkflowNodes(workflowJson: string): ComfyParsedNodes {
  if (!workflowJson.trim()) {
    return { valid: false, isUiFormat: false, error: '工作流 JSON 为空', imageNodes: [], promptNodes: [] }
  }
  try {
    const parsed = JSON.parse(workflowJson)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { valid: false, isUiFormat: false, error: '无效的 JSON 对象', imageNodes: [], promptNodes: [] }
    }
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) {
      return {
        valid: false,
        isUiFormat: true,
        error: '检测到普通画布格式 JSON，请在 ComfyUI 中使用「工作流 → 导出 (API)」得到 API 格式 JSON',
        imageNodes: [],
        promptNodes: [],
      }
    }

    const imageNodes: ComfyParsedNodes['imageNodes'] = []
    const promptNodes: ComfyParsedNodes['promptNodes'] = []

    for (const [id, node] of Object.entries<any>(parsed)) {
      if (!node || typeof node !== 'object' || !node.class_type) continue
      const classType = String(node.class_type)
      const title = String(node._meta?.title || classType)
      const inputs = node.inputs || {}

      if (classType === 'LoadImage' || typeof inputs.image === 'string') {
        imageNodes.push({ id, title, classType, currentImage: String(inputs.image || ''), ...(classType === 'LoadImageGoohai' ? { emptyValue: '无' } : {}), ...(node._meta?.studio?.imageRole === 'character_sheet' ? { role: 'character_sheet' as const } : {}) })
      }

      for (const field of ['prompt', 'text', 'string', 'positive']) {
        if (Array.isArray(node._meta?.studio?.hiddenInputs) && node._meta.studio.hiddenInputs.includes(field)) continue
        if (typeof inputs[field] === 'string') {
          promptNodes.push({ id, title, classType, field })
          break
        }
      }
    }

    if (imageNodes.length === 0 && promptNodes.length === 0) {
      return { valid: false, isUiFormat: false, error: '未在 JSON 中找到任何 ComfyUI 节点', imageNodes, promptNodes }
    }
    return { valid: true, isUiFormat: false, imageNodes, promptNodes }
  } catch (err: any) {
    return {
      valid: false,
      isUiFormat: false,
      error: `JSON 解析失败: ${err?.message || '语法错误'}`,
      imageNodes: [],
      promptNodes: [],
    }
  }
}

export function autoDetectComfyMappings(workflowJson: string): ComfyNodeMappings {
  const parsed = parseComfyWorkflowNodes(workflowJson)
  let promptNodeId = 'none'
  let portraitNodeId = 'none'
  let costumeNodeId = 'none'
  let poseNodeId = 'none'
  let stitchedNodeId = 'none'

  const posPrompt =
    parsed.promptNodes.find((n) => !/negative|反向|负面/i.test(n.title)) || parsed.promptNodes[0]
  if (posPrompt) promptNodeId = posPrompt.id

  const usedIds = new Set<string>()
  const slotImages = parsed.imageNodes.filter((node) => node.role !== 'character_sheet')
  for (const n of slotImages) {
    if (/人像|脸|人物|portrait|face|person/i.test(n.title) && portraitNodeId === 'none') {
      portraitNodeId = n.id
      usedIds.add(n.id)
    } else if (/服装|衣|穿搭|costume|cloth|outfit/i.test(n.title) && costumeNodeId === 'none') {
      costumeNodeId = n.id
      usedIds.add(n.id)
    } else if (/姿势|动作|骨架|pose/i.test(n.title) && poseNodeId === 'none') {
      poseNodeId = n.id
      usedIds.add(n.id)
    } else if (/拼图|合成|stitch/i.test(n.title) && stitchedNodeId === 'none') {
      stitchedNodeId = n.id
      usedIds.add(n.id)
    }
  }

  const remaining = slotImages.filter((n) => !usedIds.has(n.id))
  if (portraitNodeId === 'none' && remaining[0]) portraitNodeId = remaining.shift()!.id
  if (costumeNodeId === 'none' && remaining[0]) costumeNodeId = remaining.shift()!.id
  if (poseNodeId === 'none' && remaining[0]) poseNodeId = remaining.shift()!.id

  return { promptNodeId, portraitNodeId, costumeNodeId, poseNodeId, stitchedNodeId }
}

// ---------------------------------------------------------------------------
// 网络请求与中文错误
// ---------------------------------------------------------------------------

function normalizeComfyBase(baseUrl: string): string {
  return (baseUrl.trim() || defaultComfyBaseUrl()).replace(/\/+$/, '')
}

function describeComfyNetworkError(baseUrl: string, timedOut: boolean): string {
  if (timedOut) {
    return `[ComfyUI] 请求 ${baseUrl} 超时：ComfyUI 可能正忙或无响应，请查看 ComfyUI 终端日志。`
  }
  if (baseUrl.startsWith('/')) {
    return `[ComfyUI] 本地代理 ${baseUrl} 无法连通 ComfyUI：请确认 ComfyUI 已启动，且端口与启动网页时的 COMFYUI_URL 一致（默认 http://127.0.0.1:8000）。`
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const reasons = [
    `① ComfyUI 未启动，或地址/端口不对（Desktop 版默认 8000，便携版默认 8188）`,
    `② 跨域 (CORS) 被拦截：ComfyUI 启动参数需包含 --enable-cors-header "${origin}"（该参数只能填一个来源）`,
  ]
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    reasons.push('③ 浏览器「本地网络访问」权限被拒绝：请点击地址栏左侧图标允许访问本地设备')
    if (/^http:/i.test(baseUrl) && !/\/\/(127\.0\.0\.1|localhost|\[::1\])/i.test(baseUrl)) {
      reasons.push('④ HTTPS 页面不能访问局域网 HTTP 地址（混合内容限制），请改用 127.0.0.1 或本地运行本站')
    }
  }
  return `[ComfyUI] 无法连接 ${baseUrl}。可能原因：\n${reasons.join('\n')}`
}

async function comfyFetch(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  apiKey = '',
  timeoutMs = 30000
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (apiKey.trim()) headers.set('Authorization', `Bearer ${apiKey.trim()}`)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: ctrl.signal })
  } catch (e: any) {
    throw new Error(describeComfyNetworkError(baseUrl, e?.name === 'AbortError'))
  } finally {
    clearTimeout(timer)
  }
  // 开发代理连不上后端时会返回非 JSON 的 5xx
  if (
    baseUrl.startsWith('/') &&
    res.status >= 500 &&
    !(res.headers.get('content-type') || '').includes('json')
  ) {
    throw new Error(describeComfyNetworkError(baseUrl, false))
  }
  return res
}

async function readJsonSafe(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 300) }
  }
}

export async function testComfyConnection(baseUrl: string, apiKey = ''): Promise<string> {
  const cleanUrl = normalizeComfyBase(baseUrl)
  const res = await comfyFetch(cleanUrl, '/system_stats', {}, apiKey, 8000)
  if (res.status === 401 || res.status === 403) {
    throw new Error(`[ComfyUI] ${cleanUrl} 拒绝访问 (HTTP ${res.status})，请检查 API Key / 鉴权设置`)
  }
  if (!res.ok) throw new Error(`[ComfyUI] ${cleanUrl}/system_stats 返回 HTTP ${res.status}，该地址可能不是 ComfyUI`)
  const data = await readJsonSafe(res)
  if (!data?.system) throw new Error(`[ComfyUI] ${cleanUrl} 的响应不是 ComfyUI 格式，请检查地址`)
  const ver = data.system.comfyui_version || '未知版本'
  const dev = data.devices?.[0]
  const gpu = dev?.name ? String(dev.name).replace(/^cuda:\d+\s*/, '').replace(/\s*:\s*\w+$/, '') : '本地设备'
  const vram = dev?.vram_total ? ` · 显存 ${(dev.vram_total / 1024 ** 3).toFixed(1)} GB` : ''
  return `ComfyUI ${ver} · ${gpu}${vram}`
}

/** 依次尝试候选地址，返回第一个可用的 ComfyUI 地址 */
export async function detectComfyUi(
  current = '',
  apiKey = ''
): Promise<{ baseUrl: string; info: string } | null> {
  for (const url of comfyCandidateUrls(current)) {
    try {
      const info = await testComfyConnection(url, apiKey)
      return { baseUrl: url, info }
    } catch {
      /* try next */
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 工作流与本机模型/节点匹配检测（基于 /object_info）
// ---------------------------------------------------------------------------

export interface ComfyCheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  fixes: string[]
  /** 自动修正模型路径后的工作流 JSON（无修正时为 undefined） */
  fixedJson?: string
}

function comboOptions(spec: any): string[] | null {
  if (!Array.isArray(spec)) return null
  if (Array.isArray(spec[0])) return spec[0].map(String)
  if (spec[0] === 'COMBO' && Array.isArray(spec[1]?.options)) return spec[1].options.map(String)
  return null
}

const baseName = (s: string) => s.split(/[\\/]/).pop()!.toLowerCase()

export async function fetchComfyObjectInfo(baseUrl: string, apiKey: string, workflowJson: string): Promise<ComfyObjectInfo> {
  const parsed = parseComfyWorkflowNodes(workflowJson)
  if (!parsed.valid) throw new Error(parsed.error || '工作流 JSON 无效')
  const workflow: ComfyWorkflow = JSON.parse(workflowJson)
  const base = normalizeComfyBase(baseUrl)
  const classes = Array.from(new Set(Object.values(workflow).map((node) => node.class_type).filter(Boolean)))
  const entries = await Promise.all(classes.map(async (cls) => {
    const res = await comfyFetch(base, `/object_info/${encodeURIComponent(cls)}`, {}, apiKey, 15000)
    if (!res.ok) throw new Error(`[ComfyUI] 无法读取节点「${cls}」的定义（HTTP ${res.status}），请检查连接地址、访问令牌和网关接口权限。`)
    const json = await readJsonSafe(res)
    return [cls, json?.[cls]] as const
  }))
  return Object.fromEntries(entries.filter(([, definition]) => definition))
}

export async function checkComfyWorkflow(
  baseUrl: string,
  apiKey: string,
  workflowJson: string,
  mappedImageNodeIds: string[] = [],
  objectInfo?: ComfyObjectInfo
): Promise<ComfyCheckResult> {
  const parsedInfo = parseComfyWorkflowNodes(workflowJson)
  if (!parsedInfo.valid) {
    return { ok: false, errors: [parsedInfo.error || '工作流 JSON 无效'], warnings: [], fixes: [] }
  }
  const wf: ComfyWorkflow = JSON.parse(workflowJson)
  const info = objectInfo ?? await fetchComfyObjectInfo(baseUrl, apiKey, workflowJson)

  const errors: string[] = []
  const warnings: string[] = []
  const fixes: string[] = []
  const mapped = new Set(mappedImageNodeIds.filter((x) => x && x !== 'none'))
  const imageLoaders = new Set(getWorkflowImages(workflowJson, [], info).map((node) => node.nodeId))

  for (const [id, node] of Object.entries(wf)) {
    if (!node?.class_type) continue
    const title = node._meta?.title || node.class_type
    const def = info[node.class_type]
    if (!def) {
      errors.push(
        `缺少节点「${node.class_type}」（节点 ${id}：${title}）。请在 ComfyUI Manager 安装对应的自定义节点，或升级 ComfyUI。`
      )
      continue
    }
    const required = def.input?.required || {}
    const optional = def.input?.optional || {}
    const inputs = node.inputs || {}

    for (const [name, spec] of Object.entries<any>(required)) {
      // V3 自动扩展组使用 images.image_1 等扁平输入，组名本身不参与执行。
      if (spec?.[0] === 'COMFY_AUTOGROW_V3') {
        const template = spec[1]?.template
        if (template?.input?.required) {
          for (let i = 0; i < (template.min ?? 0); i++) {
            const child = template.names?.[i] ?? `${template.prefix}${i}`
            if (!(`${name}.${child}` in inputs)) {
              errors.push(`节点 ${id}「${title}」缺少必填输入 ${name}.${child}`)
            }
          }
        }
        continue
      }
      if (!(name in inputs)) errors.push(`节点 ${id}「${title}」缺少必填输入 ${name}`)
    }

    for (const [name, value] of Object.entries(inputs)) {
      if (Array.isArray(value)) continue // 节点连线
      const spec = required[name] ?? optional[name]
      const options = comboOptions(spec)
      if (!options || typeof value !== 'string') continue
      if (name === 'image' && mapped.has(id) && imageLoaders.has(id)) continue
      if (node.class_type === 'LoadImage' && name === 'image') {
        if (!mapped.has(id) && !options.includes(value)) {
          warnings.push(`节点 ${id}「${title}」引用的图片 ${value} 不在 ComfyUI input 目录中，且未映射到人像/服装/姿势槽位`)
        }
        continue
      }
      if (options.includes(value)) continue
      const sameFile = options.find((o) => baseName(o) === baseName(value))
      if (sameFile) {
        inputs[name] = sameFile
        fixes.push(`节点 ${id}「${title}」${name}：${value} → ${sameFile}（自动修正路径）`)
        continue
      }
      const sample = options.slice(0, 12).join('、')
      errors.push(
        `节点 ${id}「${title}」的 ${name} = ${value} 在本机不存在（通常是模型文件未安装或路径不同）。本机可选：${sample || '（空）'}${options.length > 12 ? ' …' : ''}`
      )
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    fixes,
    fixedJson: fixes.length ? JSON.stringify(wf, null, 2) : undefined,
  }
}

function translateNodeError(er: any): string {
  const detail = er?.details ? `（${er.details}）` : ''
  switch (er?.type) {
    case 'value_not_in_list':
      return `${er.extra_info?.input_name ?? '输入'} 的值不在本机可选列表中${detail}——通常是模型文件不存在或路径不同`
    case 'required_input_missing':
      return `缺少必填输入 ${er.extra_info?.input_name ?? ''}`
    case 'invalid_input_type':
    case 'return_type_mismatch':
      return `节点连线类型不匹配${detail}`
    case 'value_bigger_than_max':
    case 'value_smaller_than_min':
      return `参数超出范围${detail}`
    case 'image_not_found':
    case 'custom_validation_failed':
      return `${er.message || '校验失败'}${detail}`
    default:
      return `${er?.message || '校验失败'}${detail}`
  }
}

function formatComfyPromptError(json: any, wf: ComfyWorkflow, status: number): string {
  const parts: string[] = []
  const e = json?.error
  if (e) {
    if (e.type === 'missing_node_type' || /does not exist|not found/i.test(String(e.message))) {
      parts.push(`缺少节点类型：${e.details || e.message}。请在 ComfyUI Manager 安装缺失的自定义节点或升级 ComfyUI`)
    } else if (e.type === 'prompt_no_outputs') {
      parts.push('工作流没有输出节点（SaveImage / PreviewImage）')
    } else if (e.type !== 'prompt_outputs_failed_validation') {
      parts.push(`${e.message || e.type}${e.details ? `：${e.details}` : ''}`)
    }
  }
  for (const [id, ne] of Object.entries<any>(json?.node_errors || {})) {
    const title = wf[id]?._meta?.title || ne?.class_type || id
    for (const er of ne?.errors || []) {
      parts.push(`节点 ${id}「${title}」：${translateNodeError(er)}`)
    }
  }
  if (!parts.length) parts.push(json?._raw || `HTTP ${status}`)
  return `[ComfyUI] 提交工作流失败：\n${parts.join('\n')}`
}

async function freeComfyMemory(baseUrl: string, apiKey: string): Promise<void> {
  try {
    await comfyFetch(
      baseUrl,
      '/free',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      },
      apiKey,
      10000
    )
  } catch {
    /* ignore */
  }
}

function formatExecutionError(messages: any[], wf: ComfyWorkflow): { text: string; oom: boolean } {
  const errMsg = (messages || []).find((m) => m?.[0] === 'execution_error')?.[1]
  if (errMsg) {
    const title = wf[errMsg.node_id]?._meta?.title || errMsg.node_type || errMsg.node_id
    const raw = `${errMsg.exception_type || ''} ${errMsg.exception_message || ''}`
    if (/out of memory|OutOfMemory|CUDA error: out of memory|allocat/i.test(raw)) {
      return {
        oom: true,
        text:
          `[ComfyUI] 显存不足（节点 ${errMsg.node_id}「${title}」）。已请求 ComfyUI 释放显存。\n` +
          '建议：关闭其他占用显卡的程序；在工作流中把「按姿势图比例确定输出尺寸」节点的 megapixels 从 1.0 调低到 0.6；然后重试。',
      }
    }
    return {
      oom: false,
      text: `[ComfyUI] 执行出错（节点 ${errMsg.node_id}「${title}」）：${String(errMsg.exception_message || raw).trim().slice(0, 400)}`,
    }
  }
  if ((messages || []).some((m) => m?.[0] === 'execution_interrupted')) {
    return { oom: false, text: '[ComfyUI] 任务已被中断（可能在 ComfyUI 界面中点击了取消）' }
  }
  return { oom: false, text: `[ComfyUI] 工作流执行出错：${JSON.stringify(messages || '').slice(0, 300)}` }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取生成结果失败'))
    reader.onload = () => resolve(reader.result as string)
    reader.readAsDataURL(blob)
  })
}

async function uploadImageToComfy(
  baseUrl: string,
  src: string,
  filenamePrefix: string,
  apiKey: string
): Promise<string> {
  let dataUrl: string
  try {
    dataUrl = await srcToPngDataUrl(src)
  } catch {
    throw new Error(`读取参考图失败：${src.slice(0, 80)}`)
  }
  const form = new FormData()
  form.append('image', dataUrlToBlob(dataUrl), `${filenamePrefix}_${Date.now()}.png`)
  form.append('subfolder', 'pose_studio')
  form.append('overwrite', 'true')

  const res = await comfyFetch(baseUrl, '/upload/image', { method: 'POST', body: form }, apiKey, 60000)
  if (!res.ok) {
    throw new Error(`[ComfyUI] 上传参考图失败 (HTTP ${res.status})：${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  return json.subfolder ? `${json.subfolder}/${json.name}` : json.name
}

function openComfySocket(baseUrl: string, clientId: string, onMessage: (msg: any) => void): WebSocket | null {
  try {
    const u = new URL(baseUrl, window.location.href)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    u.pathname = `${u.pathname.replace(/\/+$/, '')}/ws`
    u.search = `clientId=${encodeURIComponent(clientId)}`
    const ws = new WebSocket(u.toString())
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      try {
        onMessage(JSON.parse(e.data))
      } catch {
        /* ignore */
      }
    }
    ws.onerror = () => {
      /* 进度推送失败不影响结果轮询 */
    }
    return ws
  } catch {
    return null
  }
}

export interface GenerationProgress {
  stage: 'check' | 'upload' | 'queue' | 'running' | 'download'
  message: string
  /** 0-100，未知时为 undefined */
  percent?: number
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generateWithComfyUi(params: {
  recipe: RecipeState
  prompt: string
  config: ApiConfig
  baseUrl: string
  apiKey: string
  onProgress?: (p: GenerationProgress) => void
}): Promise<{ imageUrl: string; modelUsed: string; providerUsed: ImageProviderId }> {
  const { recipe, prompt, config, baseUrl, apiKey } = params
  const report = params.onProgress ?? (() => {})
  const cp = config.comfyuiParams
  const timeoutSec = Math.max(60, cp.timeoutSec || 600)
  const parsedInfo = parseComfyWorkflowNodes(cp.workflowJson)
  if (!parsedInfo.valid) {
    throw new Error(`[ComfyUI] ${parsedInfo.error || '工作流 JSON 无效'}`)
  }

  // 0. 预检：服务在线 + 节点/模型与本机匹配
  report({ stage: 'check', message: '正在检查 ComfyUI 服务与模型…' })
  await testComfyConnection(baseUrl, apiKey)
  const schemas = await fetchComfyObjectInfo(baseUrl, apiKey, cp.workflowJson)
  const extraImageNodes = getWorkflowImages(cp.workflowJson, [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId], schemas)
  const extraImages = recipe.workflowImagesIdentity === workflowIdentity(cp.workflowJson) ? recipe.workflowImages || {} : {}
  const selectedJson = applyWorkflowOverrides(cp.workflowJson, cp.parameterOverrides, schemas)
  const check = await checkComfyWorkflow(baseUrl, apiKey, selectedJson, [
    cp.portraitNodeId,
    cp.costumeNodeId,
    cp.poseNodeId,
    cp.stitchedNodeId,
    ...extraImageNodes.filter((node) => extraImages[node.nodeId]?.url || (node.optional && node.role === 'character_sheet')).map((node) => node.nodeId),
  ], schemas)
  if (!check.ok) {
    throw new Error(`[ComfyUI] 工作流与本机不匹配：\n${check.errors.join('\n')}`)
  }
  const workflow: ComfyWorkflow = JSON.parse(check.fixedJson ?? selectedJson)

  // 1. 按映射槽位上传参考图并注入节点
  const slotUploads: Array<{ nodeId: string; src: string | null; prefix: string; label: string }> = [
    {
      nodeId: cp.portraitNodeId,
      src: recipe.portrait ? recipe.portrait.原图 || recipe.portrait.缩略图 : null,
      prefix: 'studio_portrait',
      label: '人像',
    },
    {
      nodeId: cp.costumeNodeId,
      src: recipe.costume ? recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图 : null,
      prefix: 'studio_costume',
      label: '服装',
    },
    {
      nodeId: cp.poseNodeId,
      src: recipe.pose ? recipe.pose.原图 || recipe.pose.缩略图 : null,
      prefix: 'studio_pose',
      label: '姿势',
    },
  ]
  const combinationError = validateReferenceCombinations(cp.workflowJson, [
    ...slotUploads.filter((slot) => slot.src && slot.nodeId && slot.nodeId !== 'none').map((slot) => slot.nodeId),
    ...extraImageNodes.filter((node) => extraImages[node.nodeId]?.url).map((node) => node.nodeId),
  ])
  if (combinationError) throw new Error(`[ComfyUI] ${combinationError}`)

  const invalidSlots = slotUploads.filter((slot) => slot.nodeId && slot.nodeId !== 'none' && !parsedInfo.imageNodes.some((node) => node.id === slot.nodeId))
  if (invalidSlots.length) {
    throw new Error(`[ComfyUI] ${invalidSlots.map((slot) => slot.label).join('、')}节点映射已失效，请重新识别或选择节点`)
  }
  const missingSlots = slotUploads.filter((slot) => slot.nodeId && slot.nodeId !== 'none' && !slot.src && parsedInfo.imageNodes.find((node) => node.id === slot.nodeId)?.emptyValue === undefined)
  if (missingSlots.length) {
    throw new Error(`[ComfyUI] 请先选择或上传：${missingSlots.map((slot) => slot.label).join('、')}`)
  }

  for (const slot of slotUploads) {
    if (!slot.nodeId || slot.nodeId === 'none' || !workflow[slot.nodeId]?.inputs) continue
    if (!slot.src) {
      const emptyValue = parsedInfo.imageNodes.find((node) => node.id === slot.nodeId)?.emptyValue
      if (emptyValue !== undefined) {
        workflow[slot.nodeId].inputs.image = emptyValue
        continue
      }
      throw new Error(`当前工作流需要「${slot.label}」参考图（节点 ${slot.nodeId}），请先在图库中选择`)
    }
    report({ stage: 'upload', message: `正在上传${slot.label}参考图…` })
    workflow[slot.nodeId].inputs.image = await uploadImageToComfy(baseUrl, slot.src, slot.prefix, apiKey)
  }

  for (const node of extraImageNodes) {
    const image = extraImages[node.nodeId]
    if (!image?.url) {
      if (node.optional && node.role === 'character_sheet') workflow[node.nodeId].inputs.image = '无'
      continue
    }
    report({ stage: 'upload', message: `正在上传${node.label}…` })
    workflow[node.nodeId].inputs.image = await uploadImageToComfy(baseUrl, image.url, 'studio_reference', apiKey)
  }

  if (cp.stitchedNodeId && cp.stitchedNodeId !== 'none' && workflow[cp.stitchedNodeId]?.inputs) {
    report({ stage: 'upload', message: '正在上传参考拼图…' })
    const stitchedDataUrl = await stitchRecipeCanvas(recipe)
    workflow[cp.stitchedNodeId].inputs.image = await uploadImageToComfy(baseUrl, stitchedDataUrl, 'studio_stitched', apiKey)
  }

  // 2. 注入提示词节点
  if (cp.promptNodeId && cp.promptNodeId !== 'none' && workflow[cp.promptNodeId]?.inputs) {
    const inputs = workflow[cp.promptNodeId].inputs
    for (const field of ['prompt', 'text', 'string', 'positive']) {
      if (typeof inputs[field] === 'string') {
        inputs[field] = prompt
        break
      }
    }
  }

  // 3. 随机化种子
  if (cp.randomizeSeed) {
    const nextSeed = Math.floor(Math.random() * 90000000000000) + 1000000
    for (const node of Object.values<any>(workflow)) {
      if (!node?.inputs) continue
      if (typeof node.inputs.seed === 'number') node.inputs.seed = nextSeed
      if (typeof node.inputs.noise_seed === 'number') node.inputs.noise_seed = nextSeed
    }
  }

  // 4. 提交任务到 ComfyUI /prompt，并通过 WebSocket 接收实时进度
  const clientId = `pose_studio_${Math.random().toString(36).slice(2, 10)}`
  let promptId = ''
  let lastNodeTitle = ''
  const ws = openComfySocket(baseUrl, clientId, (msg) => {
    const d = msg?.data
    if (!d || (promptId && d.prompt_id && d.prompt_id !== promptId)) return
    if (msg.type === 'executing' && d.node) {
      lastNodeTitle = workflow[d.node]?._meta?.title || workflow[d.node]?.class_type || d.node
      report({ stage: 'running', message: `正在执行：${lastNodeTitle}` })
    } else if (msg.type === 'progress' && d.max) {
      const percent = Math.round((d.value / d.max) * 100)
      report({ stage: 'running', message: `${lastNodeTitle || '采样中'}（${d.value}/${d.max}）`, percent })
    }
  })

  try {
    report({ stage: 'queue', message: '正在提交工作流…' })
    const promptRes = await comfyFetch(
      baseUrl,
      '/prompt',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
      },
      apiKey,
      60000
    )
    const promptJson = await readJsonSafe(promptRes)
    if (!promptRes.ok || !promptJson?.prompt_id) {
      throw new Error(formatComfyPromptError(promptJson, workflow, promptRes.status))
    }
    promptId = promptJson.prompt_id
    report({ stage: 'queue', message: '已提交，等待 ComfyUI 执行…' })

    // 5. 轮询 /history/{prompt_id} 获取最终结果
    const startedAt = Date.now()
    for (let attempt = 0; ; attempt++) {
      await sleep(1500)
      if (Date.now() - startedAt > timeoutSec * 1000) {
        await cancelComfyPrompt(baseUrl, apiKey, promptId)
        throw new Error(
          `[ComfyUI] 等待生成结果超时（超过 ${Math.round(timeoutSec / 60)} 分钟），已取消该任务。首次加载模型较慢，可在合成台调大超时时间后重试。`
        )
      }
      let histRes: Response
      try {
        histRes = await comfyFetch(baseUrl, `/history/${promptId}`, {}, apiKey, 15000)
      } catch (e) {
        if (attempt % 4 === 3) report({ stage: 'running', message: '暂时无法连接 ComfyUI，正在重试…' })
        if (Date.now() - startedAt > 60000 && attempt % 20 === 19) throw e
        continue
      }
      if (!histRes.ok) continue
      const item = (await readJsonSafe(histRes))?.[promptId]
      if (!item) {
        if (attempt % 3 === 0) {
          try {
            const q = await (await comfyFetch(baseUrl, '/queue', {}, apiKey, 10000)).json()
            const pendingIdx = (q?.queue_pending || []).findIndex((x: any) => x?.[1] === promptId)
            if (pendingIdx >= 0) {
              report({ stage: 'queue', message: `排队中，前方还有 ${pendingIdx + (q.queue_running?.length || 0)} 个任务` })
            }
          } catch {
            /* ignore */
          }
        }
        continue
      }

      if (item.status?.status_str === 'error') {
        const { text, oom } = formatExecutionError(item.status?.messages, workflow)
        if (oom) await freeComfyMemory(baseUrl, apiKey)
        throw new Error(text)
      }
      if (item.status && item.status.completed === false && item.status.status_str !== 'success') continue

      let outImg: { filename: string; subfolder?: string; type?: string } | null = null
      for (const nodeOut of Object.values<any>(item.outputs || {})) {
        for (const im of nodeOut?.images || []) {
          if (!outImg || (im?.type === 'output' && outImg.type !== 'output')) outImg = im
        }
      }
      if (!outImg) {
        if (item.status?.completed) throw new Error('[ComfyUI] 工作流已执行完成，但没有输出图片（请检查是否有 SaveImage 节点）')
        continue
      }

      report({ stage: 'download', message: '正在获取生成结果…', percent: 100 })
      const qs = new URLSearchParams({
        filename: outImg.filename,
        subfolder: outImg.subfolder || '',
        type: outImg.type || 'output',
      })
      const viewRes = await comfyFetch(baseUrl, `/view?${qs.toString()}`, {}, apiKey, 60000)
      if (!viewRes.ok) throw new Error(`[ComfyUI] 获取生成图片失败 (HTTP ${viewRes.status})`)
      const blob = await viewRes.blob()
      if (!blob.size || !blob.type.startsWith('image/')) {
        throw new Error('[ComfyUI] 返回的生成结果不是有效图片')
      }
      return { imageUrl: await blobToDataUrl(blob), modelUsed: 'ComfyUI 工作流', providerUsed: 'comfyui' }
    }
  } finally {
    ws?.close()
  }
}

async function cancelComfyPrompt(baseUrl: string, apiKey: string, promptId: string): Promise<void> {
  try {
    const q = await (await comfyFetch(baseUrl, '/queue', {}, apiKey, 10000)).json()
    if ((q?.queue_running || []).some((x: any) => x?.[1] === promptId)) {
      await comfyFetch(baseUrl, '/interrupt', { method: 'POST' }, apiKey, 10000)
    } else {
      await comfyFetch(
        baseUrl,
        '/queue',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }) },
        apiKey,
        10000
      )
    }
  } catch {
    /* ignore */
  }
}

export async function generateCharacterImage(params: {
  recipe: RecipeState
  prompt: string
  config: ApiConfig
  onProgress?: (p: GenerationProgress) => void
}): Promise<{ imageUrl: string; modelUsed: string; providerUsed: ImageProviderId }> {
  const { recipe, prompt, config, onProgress } = params
  const provider = config.activeProvider
  const pCfg = config.providers[provider]
  const apiKey = pCfg.apiKey.trim()

  if (provider !== 'comfyui' && !apiKey) {
    throw new Error(`请先配置 ${PROVIDER_META[provider].name} 的 API Key`)
  }

  const rawSources = [
    recipe.portrait && (recipe.portrait.原图 || recipe.portrait.缩略图),
    recipe.costume && (recipe.costume.预览图 || recipe.costume.原图 || recipe.costume.缩略图),
    recipe.pose && (recipe.pose.原图 || recipe.pose.缩略图),
    ...(recipe.extraImages || []).map((x) => x.url),
    ...(provider === 'comfyui' && recipe.workflowImagesIdentity === workflowIdentity(config.comfyuiParams.workflowJson)
      ? Object.values(recipe.workflowImages || {}).map((image) => image.url) : []),
  ].filter(Boolean) as string[]

  if (!rawSources.length) {
    throw new Error('请先选择或上传至少 1 张参考图')
  }

  const model = pCfg.model === 'custom' ? pCfg.customModel.trim() : pCfg.model
  if (provider !== 'comfyui' && !model) {
    throw new Error('请选择或填写有效的模型名称')
  }

  const baseUrl = (pCfg.baseUrl.trim() || PROVIDER_META[provider].defaultBaseUrl).replace(/\/+$/, '')

  if (provider === 'comfyui') {
    return generateWithComfyUi({ recipe, prompt, config, baseUrl, apiKey, onProgress })
  }

  // 判断当前请求是否需要转换为本地 Base64：
  // 1) 用户显式选择了 base64 模式
  // 2) 或者勾选了「附带三合一 Canvas 合成图」（本地动态绘制无公网 URL）
  // 3) 或者使用 Gemini Native 原生接口 / OpenAI multipart/form-data 模式
  const needBase64 =
    config.imagePassMode === 'base64' ||
    config.sendStitchedSheet ||
    (provider === 'gemini' && config.geminiParams.endpointMode === 'native') ||
    (provider === 'gpt' && config.gptParams.endpointMode === 'images_edits')

  const imageRefs: string[] = needBase64
    ? await Promise.all(rawSources.map(srcToPngDataUrl))
    : rawSources.map(toPublicHttpsUrl)

  const allImageRefs: string[] = config.sendStitchedSheet
    ? [...imageRefs, await stitchRecipeCanvas(recipe)]
    : imageRefs

  let res: Response
  let json: any

  // =========================================================================
  // 协议 1: OpenAI GPT Image (gpt-image-2.5 / gpt-image-2 / gpt-image-1.5 / 1)
  // =========================================================================
  if (provider === 'gpt') {
    const g = config.gptParams
    const v1 = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`

    if (g.endpointMode === 'images_edits_json') {
      // OpenAI 最新 /v1/images/edits JSON 协议：直接传 images: [{ image_url: "https://..." }]，无需上传文件流！
      const payload: Record<string, any> = {
        model,
        prompt,
        images: allImageRefs.map((ref) => ({ image_url: ref })),
      }
      if (g.size !== 'auto') payload.size = g.size
      if (g.quality !== 'auto') payload.quality = g.quality
      if (g.inputFidelity) payload.input_fidelity = g.inputFidelity
      if (g.background !== 'auto') payload.background = g.background
      if (g.outputFormat) payload.output_format = g.outputFormat
      if (g.moderation !== 'auto') payload.moderation = g.moderation

      res = await smartFetch(
        `${v1}/images/edits`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        },
        config.useProxy
      )
      json = await res.json()
    } else if (g.endpointMode === 'images_edits') {
      // 传统 /v1/images/edits (multipart/form-data 二进制文件上传)
      const fd = new FormData()
      fd.append('model', model)
      fd.append('prompt', prompt)
      allImageRefs.forEach((du, i) => {
        fd.append('image[]', dataUrlToBlob(du), `ref_${i + 1}.png`)
      })
      if (g.size !== 'auto') fd.append('size', g.size)
      if (g.quality !== 'auto') fd.append('quality', g.quality)
      if (g.inputFidelity) fd.append('input_fidelity', g.inputFidelity)
      if (g.background !== 'auto') fd.append('background', g.background)
      if (g.outputFormat) fd.append('output_format', g.outputFormat)
      if (g.moderation !== 'auto') fd.append('moderation', g.moderation)

      res = await smartFetch(
        `${v1}/images/edits`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: fd,
        },
        config.useProxy
      )
      json = await res.json()
    } else if (g.endpointMode === 'responses') {
      // OpenAI Responses API (/v1/responses) 支持直接传 HTTPS image_url 或 Base64
      const inputContent = [
        ...allImageRefs.map((ref) => ({ type: 'input_image', image_url: ref })),
        { type: 'input_text', text: prompt },
      ]
      const toolCfg: Record<string, any> = { type: 'image_generation' }
      if (g.size !== 'auto') toolCfg.size = g.size
      if (g.quality !== 'auto') toolCfg.quality = g.quality
      if (g.background !== 'auto') toolCfg.background = g.background
      if (g.inputFidelity) toolCfg.input_fidelity = g.inputFidelity
      if (g.outputFormat) toolCfg.output_format = g.outputFormat

      res = await smartFetch(
        `${v1}/responses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: [{ role: 'user', content: inputContent }],
            tools: [toolCfg],
          }),
        },
        config.useProxy
      )
      json = await res.json()
    } else {
      // 兼容中转站 Chat Completions，支持直接传 HTTPS URL
      const content = [
        { type: 'text', text: prompt },
        ...allImageRefs.map((ref) => ({ type: 'image_url', image_url: { url: ref } })),
      ]
      res = await smartFetch(
        `${v1}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            modalities: ['text', 'image'],
          }),
        },
        config.useProxy
      )
      json = await res.json()
    }
  }
  // =========================================================================
  // 协议 2: Google Gemini 原生 / Nano Banana
  // =========================================================================
  else if (provider === 'gemini') {
    const gm = config.geminiParams
    if (gm.endpointMode === 'native') {
      const root = baseUrl.replace(/\/v1(?:beta)?$/, '')
      const url = `${root}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const parts = [
        ...allImageRefs.map((du) => ({
          inlineData: { mimeType: 'image/png', data: du.split(',')[1] },
        })),
        { text: prompt },
      ]
      const isGemini3 = model.includes('gemini-3')
      const imageConfig: Record<string, string> = {
        aspectRatio: gm.aspectRatio,
      }
      if (isGemini3 && gm.imageSize) {
        imageConfig.imageSize = gm.imageSize
      }

      res = await smartFetch(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig,
            },
          }),
        },
        config.useProxy
      )
      json = await res.json()
    } else {
      const v1 = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`
      const content = [
        { type: 'text', text: `${prompt}\n(Output aspect ratio: ${gm.aspectRatio}, resolution: ${gm.imageSize})` },
        ...allImageRefs.map((ref) => ({ type: 'image_url', image_url: { url: ref } })),
      ]
      res = await smartFetch(
        `${v1}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content }],
            modalities: ['text', 'image'],
          }),
        },
        config.useProxy
      )
      json = await res.json()
    }
  }
  // =========================================================================
  // 协议 3: 阿里云百炼 Qwen-Image (DashScope multimodal-generation)
  // =========================================================================
  else if (provider === 'qwen') {
    const qw = config.qwenParams
    const endpoint = baseUrl.includes('/services/aigc/')
      ? baseUrl
      : `${baseUrl.replace(/\/api\/v1$/, '')}/api/v1/services/aigc/multimodal-generation/generation`

    // Qwen-Image 原生支持直接传入公网 HTTPS URL 或 Base64 Data URL: {"image": "https://..."}
    const content = [
      ...imageRefs.map((ref) => ({ image: ref })),
      { text: prompt },
    ]

    res = await smartFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [
              {
                role: 'user',
                content,
              },
            ],
          },
          parameters: {
            size: qw.size,
            n: qw.n || 1,
            prompt_extend: qw.promptExtend,
            watermark: qw.watermark,
            ...(qw.negativePrompt.trim() ? { negative_prompt: qw.negativePrompt.trim() } : {}),
          },
        }),
      },
      config.useProxy
    )
    json = await res.json()
  }
  // =========================================================================
  // 协议 4: 字节火山方舟 Doubao Seedream (/api/v3/images/generations)
  // =========================================================================
  else {
    const db = config.doubaoParams
    let endpoint = baseUrl
    if (!endpoint.endsWith('/images/generations')) {
      if (endpoint.endsWith('/api/v3') || endpoint.endsWith('/v1')) {
        endpoint = `${endpoint}/images/generations`
      } else {
        endpoint = `${endpoint}/api/v3/images/generations`
      }
    }

    res = await smartFetch(
      endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          image: allImageRefs, // Seedream 4.0 / 4.5 / 5.0 原生支持传入多张参考图 URL 数组或 Base64 数组
          size: db.size,
          sequential_image_generation: db.sequentialImageGeneration,
          watermark: db.watermark,
          response_format: db.responseFormat,
        }),
      },
      config.useProxy
    )
    json = await res.json()
  }

  if (!res.ok) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      json?.code ||
      `请求失败 (HTTP ${res.status})`
    throw new Error(`[${PROVIDER_META[provider].shortName}] ${errMsg}`)
  }

  const imageUrl = extractUniversalImage(json)
  if (!imageUrl) {
    const fallbackText =
      json?.choices?.[0]?.message?.content ||
      json?.output?.choices?.[0]?.message?.content?.[0]?.text ||
      JSON.stringify(json).slice(0, 260)
    throw new Error(`接口已响应但未解析到图片输出：${fallbackText}`)
  }

  return { imageUrl, modelUsed: model, providerUsed: provider }
}
