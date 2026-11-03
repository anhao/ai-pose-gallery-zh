import { createContext, type ReactNode, useContext, useEffect, useEffectEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { isNsfwCostume, isNsfwPose } from '@/api/gallery'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { idbRead, idbWrite } from '@/lib/idbStorage'
import { parseParameterWorkflow, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import { durableImage, snapshotGeneration } from '@/lib/generationSnapshot'
import { recipeBackup } from '@/lib/recipeImages'
import {
  buildRecipePrompt,
  COMFYUI_WORKFLOW_TEMPLATES,
  DEFAULT_COMFY_PRESET,
  generateCharacterImage,
  resumeComfyTask,
  ComfyTaskError,
  ComfySubmissionRejectedError,
  type ComfyTaskHandle,
  type GenerationProgress,
  PROVIDER_META,
  stitchRecipeCanvas,
} from '@/services/aiGenerator'
import type {
  ApiConfig,
  ComfyUiParams,
  CostumeItem,
  DoubaoParams,
  ExtraReferenceImage,
  GeminiParams,
  GenerationHistoryItem,
  GenerationSnapshot,
  GptParams,
  ImageProviderId,
  PortraitItem,
  PoseItem,
  ProviderEndpointConfig,
  QwenParams,
  RecipeState,
} from '@/types/gallery'

const CFG_KEY = 'pose_atlas_api_config_v3'
const RECIPE_KEY = 'pose_atlas_recipe_v3'
const HISTORY_KEY = 'pose_atlas_history_v3'
const TASK_KEY = 'pose_atlas_active_task_v1'
type ActiveTask = { task?: ComfyTaskHandle; prompt: string; summary: string; unknown?: boolean; snapshot?: GenerationSnapshot }
const SAFE_MODE_KEY = 'pose_atlas_safe_mode_v1'

const COMFY_CONFIG_VERSION = 3

const shouldEnableProxyByDefault = (provider?: ImageProviderId) =>
  provider === 'qwen' || provider === 'doubao'

const DEFAULT_API_CONFIG: ApiConfig = {
  activeProvider: 'gemini',
  imagePassMode: 'url',
  useProxy: false,
  stylePreset: 'realistic',
  sendStitchedSheet: false,
  providers: {
    gemini: {
      baseUrl: PROVIDER_META.gemini.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gemini.models[0].value,
      customModel: '',
    },
    gpt: {
      baseUrl: PROVIDER_META.gpt.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.gpt.models[0].value,
      customModel: '',
    },
    qwen: {
      baseUrl: PROVIDER_META.qwen.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.qwen.models[0].value,
      customModel: '',
    },
    doubao: {
      baseUrl: PROVIDER_META.doubao.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.doubao.models[0].value,
      customModel: '',
    },
    comfyui: {
      baseUrl: PROVIDER_META.comfyui.defaultBaseUrl,
      apiKey: '',
      model: PROVIDER_META.comfyui.models[0].value,
      customModel: '',
    },
  },
  gptParams: {
    endpointMode: 'images_edits_json',
    size: '1024x1536',
    quality: 'high',
    inputFidelity: 'high',
    background: 'auto',
    outputFormat: 'png',
    moderation: 'auto',
  },
  geminiParams: {
    endpointMode: 'native',
    aspectRatio: '3:4',
    imageSize: '2K',
  },
  qwenParams: {
    size: '1024*1536',
    promptExtend: true,
    watermark: false,
    negativePrompt: '',
    n: 1,
  },
  doubaoParams: {
    size: '2K',
    sequentialImageGeneration: 'disabled',
    watermark: false,
    responseFormat: 'b64_json',
  },
  comfyuiParams: {
    workflowPreset: DEFAULT_COMFY_PRESET,
    workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
    ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    randomizeSeed: true,
    timeoutSec: 600,
    configVersion: COMFY_CONFIG_VERSION,
  },
}

// v1 → v2：旧版默认的 Qwen 2.1 预设引用了本机通常不存在的模型，自动切换为 Qwen Image Edit 2509
const LEGACY_COMFY_BASE_URLS = ['http://127.0.0.1:8188', 'http://localhost:8188']

function migrateComfy(
  provider: ApiConfig['providers']['comfyui'],
  params: ApiConfig['comfyuiParams']
): { provider: ApiConfig['providers']['comfyui']; params: ApiConfig['comfyuiParams'] } {
  if ((params.configVersion ?? 1) >= COMFY_CONFIG_VERSION) return { provider, params }
  const nextParams = { ...params, configVersion: COMFY_CONFIG_VERSION }
  if (params.workflowPreset === 'qwen21_3img' || params.workflowPreset === 'qwen21_2img') {
    Object.assign(nextParams, {
      workflowPreset: DEFAULT_COMFY_PRESET,
      workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].workflow, null, 2),
      ...COMFYUI_WORKFLOW_TEMPLATES[DEFAULT_COMFY_PRESET].defaults,
    })
  }
  const nextProvider = { ...provider }
  if (!nextProvider.baseUrl.trim() || LEGACY_COMFY_BASE_URLS.includes(nextProvider.baseUrl.trim())) {
    nextProvider.baseUrl = PROVIDER_META.comfyui.defaultBaseUrl
  }
  if (!PROVIDER_META.comfyui.models.some((m) => m.value === nextProvider.model)) {
    nextProvider.model = PROVIDER_META.comfyui.models[0].value
  }
  return { provider: nextProvider, params: nextParams }
}

function mergeStoredConfig(raw: unknown): ApiConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_API_CONFIG
  const obj = raw as Partial<ApiConfig>
  const storedVer = obj.comfyuiParams?.configVersion ?? 1
  const comfy = migrateComfy(
    { ...DEFAULT_API_CONFIG.providers.comfyui, ...obj.providers?.comfyui },
    { ...DEFAULT_API_CONFIG.comfyuiParams, configVersion: 1, ...obj.comfyuiParams }
  )
  const activeProvider = obj.activeProvider ?? DEFAULT_API_CONFIG.activeProvider
  // v3 起服务端 CORS 代理默认关闭，仅在切换到 Qwen / Doubao 时自动关联开启
  const useProxy =
    storedVer < 3
      ? shouldEnableProxyByDefault(activeProvider)
      : (obj.useProxy ?? shouldEnableProxyByDefault(activeProvider))
  return {
    ...DEFAULT_API_CONFIG,
    ...obj,
    activeProvider,
    useProxy,
    providers: {
      gemini: { ...DEFAULT_API_CONFIG.providers.gemini, ...obj.providers?.gemini },
      gpt: { ...DEFAULT_API_CONFIG.providers.gpt, ...obj.providers?.gpt },
      qwen: { ...DEFAULT_API_CONFIG.providers.qwen, ...obj.providers?.qwen },
      doubao: { ...DEFAULT_API_CONFIG.providers.doubao, ...obj.providers?.doubao },
      comfyui: comfy.provider,
    },
    gptParams: { ...DEFAULT_API_CONFIG.gptParams, ...obj.gptParams },
    geminiParams: { ...DEFAULT_API_CONFIG.geminiParams, ...obj.geminiParams },
    qwenParams: { ...DEFAULT_API_CONFIG.qwenParams, ...obj.qwenParams },
    doubaoParams: { ...DEFAULT_API_CONFIG.doubaoParams, ...obj.doubaoParams },
    comfyuiParams: comfy.params,
  }
}

interface StudioContextValue {
  hydrated: boolean
  activeTask: ActiveTask | null
  resumeGeneration: () => Promise<void>
  stopTracking: () => Promise<void>
  recipe: RecipeState
  apiConfig: ApiConfig
  history: GenerationHistoryItem[]
  safeMode: boolean
  toggleSafeMode: () => void
  requestUnlockNsfw: (onUnlocked?: () => void) => void
  poseDepthMode: boolean
  setPoseDepthMode: (val: boolean) => void
  toggleRecipePoseDepth: () => void
  // 全局持久化的合成台状态（切换页面不丢失、不断开请求）
  customPrompt: string | null
  setCustomPrompt: (val: string | null) => void
  previewUrl: string
  setPreviewUrl: (url: string) => void
  isGenerating: boolean
  generatingModel: string
  generationProgress: GenerationProgress | null
  generationError: string
  startGeneration: (overridePrompt?: string) => Promise<void>
  refreshStitchPreview: () => Promise<void>
  setPortrait: (item: PortraitItem | null) => void
  setCostume: (item: CostumeItem | null) => void
  setPose: (item: PoseItem | null) => void
  togglePortrait: (item: PortraitItem) => void
  toggleCostume: (item: CostumeItem) => void
  togglePose: (item: PoseItem) => void
  addExtraImage: (item: { name: string; url: string }) => void
  removeExtraImage: (id: string) => void
  updateExtraImageName: (id: string, name: string) => void
  setWorkflowImage: (nodeId: string, image: ExtraReferenceImage | null, identity: string) => void
  clearRecipe: () => void
  randomizeRecipe: (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }) => void
  updateApiConfig: (patch: Partial<ApiConfig>) => void
  updateProviderConfig: (provider: ImageProviderId, patch: Partial<ProviderEndpointConfig>) => void
  updateGptParams: (patch: Partial<GptParams>) => void
  updateGeminiParams: (patch: Partial<GeminiParams>) => void
  updateQwenParams: (patch: Partial<QwenParams>) => void
  updateDoubaoParams: (patch: Partial<DoubaoParams>) => void
  updateComfyUiParams: (patch: Partial<ComfyUiParams>) => void
  addHistory: (item: Omit<GenerationHistoryItem, 'id' | 'createdAt'>) => void
  removeHistoryItem: (id: string) => void
  clearHistory: () => void
}

const StudioContext = createContext<StudioContextValue | null>(null)

export function StudioProvider({ children }: { children: ReactNode }) {
  const [recipe, setRecipe] = useState<RecipeState>(() => {
    try {
      const raw = localStorage.getItem(RECIPE_KEY)
      if (!raw) return { portrait: null, costume: null, pose: null, extraImages: [] }
      const parsed = JSON.parse(raw)
      return {
        portrait: parsed.portrait ?? null,
        costume: parsed.costume ?? null,
        pose: parsed.pose ?? null,
        extraImages: Array.isArray(parsed.extraImages) ? parsed.extraImages : [],
      }
    } catch {
      return { portrait: null, costume: null, pose: null, extraImages: [] }
    }
  })

  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => {
    try {
      const raw = localStorage.getItem(CFG_KEY)
      return raw ? mergeStoredConfig(JSON.parse(raw)) : DEFAULT_API_CONFIG
    } catch {
      return DEFAULT_API_CONFIG
    }
  })

  const [history, setHistory] = useState<GenerationHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [safeMode, setSafeMode] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(SAFE_MODE_KEY)
      return raw === null ? true : raw !== 'false'
    } catch {
      return true
    }
  })
  const [ageGateOpen, setAgeGateOpen] = useState(false)
  const pendingUnlockCbRef = useRef<(() => void) | null>(null)
  const [poseDepthMode, setPoseDepthModeState] = useState<boolean>(() => Boolean(recipe.pose?.useDepth))

  // 提升到根部 Provider 的生成状态，路由切换不会卸载或中断
  const [customPrompt, setCustomPrompt] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      const list = raw ? JSON.parse(raw) : []
      return list[0]?.imageUrl || ''
    } catch {
      return ''
    }
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingModel, setGeneratingModel] = useState('')
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress | null>(null)
  const [generationError, setGenerationError] = useState('')
  const isGeneratingRef = useRef(false)
  const [activeTask, setActiveTask] = useState<ActiveTask | null>(null)
  const activeTaskRef = useRef<ActiveTask | null>(null)
  const trackingRef = useRef<AbortController | null>(null)
  const historyRef = useRef(history)
  const historyWrites = useRef<Promise<void>>(Promise.resolve())
  const [idbHydrated, setIdbHydrated] = useState(false)

  // 从 IndexedDB 异步恢复大容量历史记录与含附图的配方
  useEffect(() => {
    let active = true
    Promise.all([
      idbRead<RecipeState>(RECIPE_KEY),
      idbRead<GenerationHistoryItem[]>(HISTORY_KEY),
      idbRead<ActiveTask | null>(TASK_KEY),
    ]).then(([savedRecipe, savedHistory, savedTask]) => {
      if (!active) return
      if (savedRecipe) {
        if (savedRecipe.pose?.useDepth !== undefined) {
          setPoseDepthModeState(Boolean(savedRecipe.pose.useDepth))
        }
        setRecipe({
          portrait: savedRecipe.portrait ?? null,
          costume: savedRecipe.costume ?? null,
          pose: savedRecipe.pose ?? null,
          workflowImages: savedRecipe.workflowImages ?? {},
          workflowImagesIdentity: savedRecipe.workflowImagesIdentity,
          extraImages: Array.isArray(savedRecipe.extraImages) ? savedRecipe.extraImages : [],
        })
      }
      if (Array.isArray(savedHistory)) {
        historyRef.current = savedHistory
        setHistory(savedHistory)
        setPreviewUrl((prev) => prev || savedHistory[0]?.imageUrl || '')
      }
      activeTaskRef.current = savedTask || null
      setActiveTask(savedTask || null)
      setIdbHydrated(true)
    }).catch(() => { if (active) toast.error('无法读取浏览器存储，已暂停生成以保护未决任务；请恢复存储后刷新') })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!idbHydrated) return
    void idbWrite(RECIPE_KEY, recipe).catch(() => toast.error('配方保存失败，请检查浏览器存储空间'))
    try {
      // 上传图片和附图完整保存在 IndexedDB，轻量备份不包含它们。
      localStorage.setItem(
        RECIPE_KEY,
        JSON.stringify(recipeBackup(recipe))
      )
    } catch {}
  }, [recipe, idbHydrated])

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(apiConfig))
    } catch {}
  }, [apiConfig])

  useEffect(() => {
    try {
      localStorage.setItem(SAFE_MODE_KEY, String(safeMode))
    } catch {}
  }, [safeMode])

  const requestUnlockNsfw = (onUnlocked?: () => void) => {
    if (!safeMode) {
      onUnlocked?.()
      return
    }
    pendingUnlockCbRef.current = onUnlocked || null
    setAgeGateOpen(true)
  }

  const confirmUnlockNsfw = () => {
    setSafeMode(false)
    setAgeGateOpen(false)
    toast.success('已解锁 18+ 完整图库模式')
    const cb = pendingUnlockCbRef.current
    pendingUnlockCbRef.current = null
    cb?.()
  }

  const toggleSafeMode = () => {
    if (safeMode) {
      requestUnlockNsfw()
    } else {
      setSafeMode(true)
      toast.success('已开启安全模式（已隐藏 18+ 敏感分类）')
    }
  }

  const setPortrait = (portrait: PortraitItem | null) => setRecipe((r) => ({ ...r, portrait }))
  const setCostume = (costume: CostumeItem | null) => setRecipe((r) => ({ ...r, costume }))
  const setPose = (pose: PoseItem | null) => setRecipe((r) => ({ ...r, pose }))

  const setPoseDepthMode = (val: boolean) => {
    setPoseDepthModeState(val)
    setRecipe((r) => {
      if (!r.pose || r.pose.source === 'upload' || Boolean(r.pose.useDepth) === val) return r
      return { ...r, pose: { ...r.pose, useDepth: val } }
    })
  }

  const toggleRecipePoseDepth = () => {
    const next = !(recipe.pose?.useDepth ?? poseDepthMode)
    setPoseDepthMode(next)
    toast.success(next ? '已切换姿势图为：深度图 (Depth)' : '已切换姿势图为：素体白模')
  }

  const togglePortrait = (item: PortraitItem) => {
    const remove = recipe.portrait?.id === item.id
    setRecipe((r) => ({ ...r, portrait: remove ? null : item }))
    toast.success(remove ? '已移除人像' : `已选人像：${item.发型名称}`)
  }
  const toggleCostume = (item: CostumeItem) => {
    const remove = recipe.costume?.id === item.id
    setRecipe((r) => ({ ...r, costume: remove ? null : item }))
    toast.success(remove ? '已移除服装' : `已选服装：${item.服装名称}`)
  }
  const togglePose = (item: PoseItem) => {
    const useDepth = item.source === 'upload' ? false : (item.useDepth ?? poseDepthMode)
    const remove = recipe.pose?.id === item.id && Boolean(recipe.pose?.useDepth) === useDepth
    setRecipe((r) => ({ ...r, pose: remove ? null : { ...item, useDepth } }))
    toast.success(remove ? '已移除姿势' : `已选姿势：${item.姿势名称}（${item.角度}${useDepth ? ' · 深度图' : ''}）`)
  }

  const addExtraImage = (item: { name: string; url: string }) => {
    const newImg: ExtraReferenceImage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: item.name || '附加参考',
      url: item.url,
    }
    setRecipe((r) => ({
      ...r,
      extraImages: [...(r.extraImages || []), newImg],
    }))
    toast.success('已添加附加参考图')
  }

  const removeExtraImage = (id: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).filter((x) => x.id !== id),
    }))
  }

  const updateExtraImageName = (id: string, name: string) => {
    setRecipe((r) => ({
      ...r,
      extraImages: (r.extraImages || []).map((x) => (x.id === id ? { ...x, name } : x)),
    }))
  }

  const setWorkflowImage = (nodeId: string, image: ExtraReferenceImage | null, identity: string) => {
    if (identity !== workflowIdentity(apiConfig.comfyuiParams.workflowJson)) return
    setRecipe((r) => {
      const workflowImages = r.workflowImagesIdentity === identity ? { ...r.workflowImages } : {}
      if (image) workflowImages[nodeId] = image
      else delete workflowImages[nodeId]
      return { ...r, workflowImages, workflowImagesIdentity: identity }
    })
  }

  const activeComfyParams = apiConfig.comfyuiParams
  useEffect(() => {
    if (!idbHydrated) return
    const cp = activeComfyParams
    const identity = workflowIdentity(cp.workflowJson)
    const workflow = parseParameterWorkflow(cp.workflowJson)
    const mapped = [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId]
    const ids = new Set(Object.entries(workflow || {}).filter(([id, node]) => !mapped.includes(id) && typeof node.inputs.image === 'string').map(([id]) => id))
    // IndexedDB 恢复与工作流变更同步时清理失效映射。
    // oxlint-disable-next-line react/set-state-in-effect
    setRecipe((r) => {
      const entries = Object.entries(r.workflowImages || {})
      const kept = r.workflowImagesIdentity === identity ? entries.filter(([id]) => ids.has(id)) : []
      if (entries.length === kept.length && r.workflowImagesIdentity === identity) return r
      return { ...r, workflowImages: Object.fromEntries(kept), workflowImagesIdentity: identity }
    })
  }, [activeComfyParams, idbHydrated])

  const clearRecipe = () => {
    setRecipe({ portrait: null, costume: null, pose: null, extraImages: [] })
    toast.success('已清空配方')
  }

  const randomizeRecipe = (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }) => {
    const posePool = safeMode ? (pools.poses || []).filter((p) => !isNsfwPose(p)) : pools.poses || []
    const costumePool = (pools.costumes || []).filter((c) => c.source !== 'charadb' && (!safeMode || !isNsfwCostume(c)))
    const portraitPool = pools.portraits || []

    setRecipe((prev) => ({
      ...prev,
      portrait: portraitPool.length
        ? portraitPool[Math.floor(Math.random() * portraitPool.length)]
        : prev.portrait,
      costume: costumePool.length
        ? costumePool[Math.floor(Math.random() * costumePool.length)]
        : prev.costume,
      pose: posePool.length
        ? { ...posePool[Math.floor(Math.random() * posePool.length)], useDepth: poseDepthMode }
        : prev.pose,
    }))
    toast.success(safeMode ? '已随机抽取一套角色配方（安全模式）' : '已随机抽取一套角色配方')
  }

  const updateApiConfig = (patch: Partial<ApiConfig>) => {
    setApiConfig((prev) => {
      const next = { ...prev, ...patch }
      if (patch.activeProvider && patch.useProxy === undefined) {
        next.useProxy = shouldEnableProxyByDefault(patch.activeProvider)
      }
      return next
    })
  }

  const updateProviderConfig = (provider: ImageProviderId, patch: Partial<ProviderEndpointConfig>) => {
    setApiConfig((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [provider]: {
          ...prev.providers[provider],
          ...patch,
        },
      },
    }))
  }

  const updateGptParams = (patch: Partial<GptParams>) => {
    setApiConfig((prev) => ({ ...prev, gptParams: { ...prev.gptParams, ...patch } }))
  }

  const updateGeminiParams = (patch: Partial<GeminiParams>) => {
    setApiConfig((prev) => ({ ...prev, geminiParams: { ...prev.geminiParams, ...patch } }))
  }

  const updateQwenParams = (patch: Partial<QwenParams>) => {
    setApiConfig((prev) => ({ ...prev, qwenParams: { ...prev.qwenParams, ...patch } }))
  }

  const updateDoubaoParams = (patch: Partial<DoubaoParams>) => {
    setApiConfig((prev) => ({ ...prev, doubaoParams: { ...prev.doubaoParams, ...patch } }))
  }

  const updateComfyUiParams = (patch: Partial<ComfyUiParams>) => {
    setApiConfig((prev) => ({ ...prev, comfyuiParams: { ...prev.comfyuiParams, ...patch } }))
  }

  const persistHistory = (update: (current: GenerationHistoryItem[]) => GenerationHistoryItem[]) => {
    const write = historyWrites.current.catch(() => {}).then(async () => {
      const next = update(historyRef.current)
      await idbWrite(HISTORY_KEY, next)
      historyRef.current = next
      setHistory(next)
    })
    historyWrites.current = write
    return write
  }
  const addHistory = (item: Omit<GenerationHistoryItem, 'id' | 'createdAt'>) => {
    void persistHistory((current) => [{ ...item, id: crypto.randomUUID(), createdAt: Date.now() }, ...current].slice(0, 30)).catch(() => toast.error('历史记录保存失败'))
  }
  const removeHistoryItem = (id: string) => {
    void persistHistory((current) => current.filter((x) => x.id !== id)).then(() => toast.success('已删除该条记录')).catch(() => toast.error('删除失败'))
  }
  const clearHistory = () => {
    void persistHistory(() => []).then(() => { localStorage.removeItem(HISTORY_KEY); toast.success('已清空记录') }).catch(() => toast.error('清空记录失败'))
  }

  const refreshStitchPreview = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setPreviewUrl(url)
      toast.success('已合成参考拼图')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const saveActive = async (value: ActiveTask | null) => {
    await idbWrite(TASK_KEY, value)
    activeTaskRef.current = value
    setActiveTask(value)
  }
  const completeGeneration = async (result: {imageUrl: string; modelUsed: string; providerUsed: ImageProviderId}, record: ActiveTask, signal: AbortSignal) => {
    signal.throwIfAborted()
    const imageUrl = await durableImage(result.imageUrl)
    signal.throwIfAborted()
    setPreviewUrl(imageUrl)
    const id = record.task ? `comfy:${record.task.baseUrl}:${record.task.promptId}` : crypto.randomUUID()
    await persistHistory((current) => {
      signal.throwIfAborted()
      return [{ id, createdAt: Date.now(), imageUrl, provider: result.providerUsed, model: result.modelUsed, prompt: record.prompt, recipeSummary: record.summary, snapshot: record.snapshot }, ...current.filter((x) => x.id !== id)].slice(0, 30)
    })
    signal.throwIfAborted()
    await saveActive(null)
    toast.success('角色图已完成并保存')
  }
  const resumeGeneration = async () => {
    const record = activeTaskRef.current
    if (!record?.task || isGeneratingRef.current) return
    isGeneratingRef.current = true
    setIsGenerating(true)
    setGenerationError('')
    const controller = new AbortController()
    trackingRef.current = controller
    try {
      const result = await resumeComfyTask({ task: record.task, apiKey: apiConfig.providers.comfyui.apiKey, timeoutSec: apiConfig.comfyuiParams.timeoutSec, onProgress: setGenerationProgress, signal: controller.signal })
      controller.signal.throwIfAborted()
      await completeGeneration(result, record, controller.signal)
    } catch (e) {
      if (e instanceof ComfySubmissionRejectedError || (e instanceof ComfyTaskError && e.reason === 'failed')) { try { await saveActive(null) } catch { toast.error('任务记录清除失败') } }
      if (!controller.signal.aborted) setGenerationError(e instanceof Error ? e.message : '无法确认任务状态，记录已保留')
    }
    finally { isGeneratingRef.current = false; setIsGenerating(false) }
  }
  const stopTracking = async () => {
    trackingRef.current?.abort()
    try { await saveActive(null); setGenerationError('已停止跟踪；后端任务可能仍在执行，请先确认队列再提交新任务') }
    catch { toast.error('停止跟踪记录保存失败') }
  }
  const resumeOnActivation = useEffectEvent(() => { void resumeGeneration() })
  // 刷新、重新激活与恢复联网只查询已有任务，不重新提交。
  useEffect(() => {
    if (!idbHydrated) return
    const resume = () => {
      if (document.visibilityState === 'visible' && activeTaskRef.current?.task && !isGeneratingRef.current) resumeOnActivation()
    }
    resume()
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume) }
  }, [idbHydrated, apiConfig.providers.comfyui.apiKey])
  useEffect(() => () => trackingRef.current?.abort(), [])
  const startGeneration = async (overridePrompt?: string) => {
    if (!idbHydrated || isGeneratingRef.current) return
    if (activeTaskRef.current) { toast.error('存在未决任务，请先恢复或明确停止跟踪'); return }
    const recipeSnapshot = recipe
    const configSnapshot = apiConfig
    const finalPrompt = overridePrompt ?? customPrompt ?? buildRecipePrompt(recipeSnapshot, configSnapshot.stylePreset, configSnapshot.activeProvider === 'comfyui' && recipeSnapshot.workflowImagesIdentity === workflowIdentity(configSnapshot.comfyuiParams.workflowJson) ? Object.values(recipeSnapshot.workflowImages || {}) : [])
    let record: ActiveTask = { prompt: finalPrompt, summary: [recipeSnapshot.portrait?.发型名称, recipeSnapshot.costume?.服装名称, recipeSnapshot.pose?.姿势名称].filter(Boolean).join(' + ') || '自定义合成' }
    isGeneratingRef.current = true
    setIsGenerating(true)
    setGeneratingModel(configSnapshot.activeProvider)
    setGenerationError('')
    setGenerationProgress(null)
    const controller = new AbortController()
    trackingRef.current = controller
    try {
      record.snapshot = await snapshotGeneration(recipeSnapshot, configSnapshot, finalPrompt)
      controller.signal.throwIfAborted()
      if (configSnapshot.activeProvider === 'comfyui') await idbWrite(TASK_KEY, null)
      const result = await generateCharacterImage({ recipe: recipeSnapshot, prompt: finalPrompt, config: configSnapshot, onProgress: setGenerationProgress, signal: controller.signal,
        onSubmitting: async (prepared) => {
          controller.signal.throwIfAborted()
          if (record.snapshot && prepared) record.snapshot.submittedWorkflowJson = JSON.stringify(prepared.workflow)
          await saveActive({ ...record, unknown: true })
          controller.signal.throwIfAborted()
        },
        onSubmitted: async (task) => {
          if (controller.signal.aborted) return
          record = { ...record, task }
          activeTaskRef.current = record
          setActiveTask(record)
          if (!controller.signal.aborted) await saveActive(record)
        },
      })
      controller.signal.throwIfAborted()
      await completeGeneration(result, record, controller.signal)
    } catch (e) {
      if (e instanceof ComfySubmissionRejectedError || (e instanceof ComfyTaskError && e.reason === 'failed')) {
        try { await saveActive(null) } catch { toast.error('任务失败记录未能清除，请停止跟踪后重试') }
      }
      const msg = e instanceof Error ? e.message : '调用失败'
      setGenerationError(msg)
      toast.error(msg.split('\n')[0])
    } finally { isGeneratingRef.current = false; setIsGenerating(false) }
  }

  return (
    <StudioContext.Provider
      value={{
        hydrated: idbHydrated,
        activeTask, resumeGeneration, stopTracking,
        recipe,
        apiConfig,
        history,
        safeMode,
        toggleSafeMode,
        requestUnlockNsfw,
        poseDepthMode,
        setPoseDepthMode,
        toggleRecipePoseDepth,
        customPrompt,
        setCustomPrompt,
        previewUrl,
        setPreviewUrl,
        isGenerating,
        generatingModel,
        generationProgress,
        generationError,
        startGeneration,
        refreshStitchPreview,
        setPortrait,
        setCostume,
        setPose,
        togglePortrait,
        toggleCostume,
        togglePose,
        addExtraImage,
        removeExtraImage,
        updateExtraImageName,
        setWorkflowImage,
        clearRecipe,
        randomizeRecipe,
        updateApiConfig,
        updateProviderConfig,
        updateGptParams,
        updateGeminiParams,
        updateQwenParams,
        updateDoubaoParams,
        updateComfyUiParams,
        addHistory,
        removeHistoryItem,
        clearHistory,
      }}
    >
      {children}

      <AlertDialog open={ageGateOpen} onOpenChange={setAgeGateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🔞 年龄确认与免责声明（NSFW 18+）</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left leading-relaxed">
              <span className="block">
                关闭「安全模式 (SFW)」后，图库将显示包含成人向艺术参考的敏感分类：
              </span>
              <span className="block rounded-lg bg-muted p-2.5 text-xs text-foreground">
                • <strong>动作姿势库</strong>：全身单人・性感系（399 张）、双人缠绵（275 张）
                <br />• <strong>服装穿搭库</strong>：内衣・睡衣（199 套）、性感穿搭（140 套）
              </span>
              <span className="block text-xs">
                <strong>免责声明</strong>：
                <br />1. <strong>年龄限制</strong>：未满 18 周岁的未成年人严禁关闭安全模式或浏览上述敏感分类。
                <br />2. <strong>来源说明</strong>：原有图鉴素材来自 ギア（@giaaibusi）；二次元服装来自 たき AI · CharaDB，适用独立来源条件，禁止真人、未成年人用途及图片再分发，首次使用须确认。
                <br />3. <strong>合法使用</strong>：本工具与素材<strong>仅供 AI 绘画学习与合法艺术创作使用，严禁用于任何违法违规、色情传播或侵害他人肖像权（如未经授权的真人换脸）等用途</strong>，使用者须自行承担一切法律责任。
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                pendingUnlockCbRef.current = null
              }}
            >
              保持安全模式
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmUnlockNsfw}>
              我已年满 18 岁并同意免责声明
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudioContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}
