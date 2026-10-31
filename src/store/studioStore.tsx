import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { idbGet, idbSet } from '@/lib/idbStorage'
import {
  buildRecipePrompt,
  COMFYUI_WORKFLOW_TEMPLATES,
  generateCharacterImage,
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

const DEFAULT_API_CONFIG: ApiConfig = {
  activeProvider: 'gemini',
  imagePassMode: 'url',
  useProxy: true,
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
    workflowPreset: 'qwen21_3img',
    workflowJson: JSON.stringify(COMFYUI_WORKFLOW_TEMPLATES.qwen21_3img.workflow, null, 2),
    ...COMFYUI_WORKFLOW_TEMPLATES.qwen21_3img.defaults,
    randomizeSeed: true,
  },
}

function mergeStoredConfig(raw: unknown): ApiConfig {
  if (!raw || typeof raw !== 'object') return DEFAULT_API_CONFIG
  const obj = raw as Partial<ApiConfig>
  return {
    ...DEFAULT_API_CONFIG,
    ...obj,
    providers: {
      gemini: { ...DEFAULT_API_CONFIG.providers.gemini, ...obj.providers?.gemini },
      gpt: { ...DEFAULT_API_CONFIG.providers.gpt, ...obj.providers?.gpt },
      qwen: { ...DEFAULT_API_CONFIG.providers.qwen, ...obj.providers?.qwen },
      doubao: { ...DEFAULT_API_CONFIG.providers.doubao, ...obj.providers?.doubao },
      comfyui: { ...DEFAULT_API_CONFIG.providers.comfyui, ...obj.providers?.comfyui },
    },
    gptParams: { ...DEFAULT_API_CONFIG.gptParams, ...obj.gptParams },
    geminiParams: { ...DEFAULT_API_CONFIG.geminiParams, ...obj.geminiParams },
    qwenParams: { ...DEFAULT_API_CONFIG.qwenParams, ...obj.qwenParams },
    doubaoParams: { ...DEFAULT_API_CONFIG.doubaoParams, ...obj.doubaoParams },
    comfyuiParams: { ...DEFAULT_API_CONFIG.comfyuiParams, ...obj.comfyuiParams },
  }
}

interface StudioContextValue {
  recipe: RecipeState
  apiConfig: ApiConfig
  history: GenerationHistoryItem[]
  // 全局持久化的合成台状态（切换页面不丢失、不断开请求）
  customPrompt: string | null
  setCustomPrompt: (val: string | null) => void
  previewUrl: string
  setPreviewUrl: (url: string) => void
  isGenerating: boolean
  generatingModel: string
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
  const isGeneratingRef = useRef(false)
  const idbHydratedRef = useRef(false)

  // 从 IndexedDB 异步恢复大容量历史记录与含附图的配方
  useEffect(() => {
    let active = true
    Promise.all([
      idbGet<RecipeState>(RECIPE_KEY),
      idbGet<GenerationHistoryItem[]>(HISTORY_KEY),
    ]).then(([savedRecipe, savedHistory]) => {
      if (!active) return
      if (savedRecipe) {
        setRecipe({
          portrait: savedRecipe.portrait ?? null,
          costume: savedRecipe.costume ?? null,
          pose: savedRecipe.pose ?? null,
          extraImages: Array.isArray(savedRecipe.extraImages) ? savedRecipe.extraImages : [],
        })
      }
      if (Array.isArray(savedHistory) && savedHistory.length > 0) {
        setHistory(savedHistory)
        setPreviewUrl((prev) => prev || savedHistory[0]?.imageUrl || '')
      }
      idbHydratedRef.current = true
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    void idbSet(RECIPE_KEY, recipe)
    try {
      // localStorage 仅保存轻量槽位备份，不存体积较大的 extraImages Base64
      localStorage.setItem(
        RECIPE_KEY,
        JSON.stringify({ ...recipe, extraImages: [] })
      )
    } catch {}
  }, [recipe])

  useEffect(() => {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(apiConfig))
    } catch {}
  }, [apiConfig])

  useEffect(() => {
    if (!idbHydratedRef.current && history.length === 0) return
    void idbSet(HISTORY_KEY, history.slice(0, 30))
  }, [history])

  const setPortrait = (portrait: PortraitItem | null) => setRecipe((r) => ({ ...r, portrait }))
  const setCostume = (costume: CostumeItem | null) => setRecipe((r) => ({ ...r, costume }))
  const setPose = (pose: PoseItem | null) => setRecipe((r) => ({ ...r, pose }))

  const togglePortrait = (item: PortraitItem) => {
    setRecipe((r) => {
      const remove = r.portrait?.id === item.id
      toast.success(remove ? '已移除人像' : `已选人像：${item.发型名称}`)
      return { ...r, portrait: remove ? null : item }
    })
  }

  const toggleCostume = (item: CostumeItem) => {
    setRecipe((r) => {
      const remove = r.costume?.id === item.id
      toast.success(remove ? '已移除服装' : `已选服装：${item.服装名称}`)
      return { ...r, costume: remove ? null : item }
    })
  }

  const togglePose = (item: PoseItem) => {
    setRecipe((r) => {
      const remove = r.pose?.id === item.id
      toast.success(remove ? '已移除姿势' : `已选姿势：${item.姿势名称}（${item.角度}）`)
      return { ...r, pose: remove ? null : item }
    })
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

  const clearRecipe = () => {
    setRecipe({ portrait: null, costume: null, pose: null, extraImages: [] })
    toast.success('已清空配方')
  }

  const randomizeRecipe = (pools: { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }) => {
    setRecipe((prev) => ({
      ...prev,
      portrait: pools.portraits?.length
        ? pools.portraits[Math.floor(Math.random() * pools.portraits.length)]
        : prev.portrait,
      costume: pools.costumes?.length
        ? pools.costumes[Math.floor(Math.random() * pools.costumes.length)]
        : prev.costume,
      pose: pools.poses?.length ? pools.poses[Math.floor(Math.random() * pools.poses.length)] : prev.pose,
    }))
    toast.success('已随机抽取一套角色配方')
  }

  const updateApiConfig = (patch: Partial<ApiConfig>) => {
    setApiConfig((prev) => ({ ...prev, ...patch }))
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

  const addHistory = (item: Omit<GenerationHistoryItem, 'id' | 'createdAt'>) => {
    setHistory((prev) => [
      { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: Date.now() },
      ...prev.slice(0, 29),
    ])
  }

  const removeHistoryItem = (id: string) => {
    setHistory((prev) => prev.filter((x) => x.id !== id))
    toast.success('已删除该条记录')
  }

  const clearHistory = () => {
    setHistory([])
    void idbSet(HISTORY_KEY, [])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {}
    toast.success('已清空记录')
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

  const startGeneration = async (overridePrompt?: string) => {
    if (isGeneratingRef.current) return
    const recipeSnapshot = recipe
    const configSnapshot = apiConfig
    const pCfg = configSnapshot.providers[configSnapshot.activeProvider]
    const modelName = pCfg.model === 'custom' ? pCfg.customModel || 'custom' : pCfg.model
    const finalPrompt =
      overridePrompt ?? customPrompt ?? buildRecipePrompt(recipeSnapshot, configSnapshot.stylePreset)

    isGeneratingRef.current = true
    setIsGenerating(true)
    setGeneratingModel(modelName)

    try {
      const { imageUrl, modelUsed, providerUsed } = await generateCharacterImage({
        recipe: recipeSnapshot,
        prompt: finalPrompt,
        config: configSnapshot,
      })
      setPreviewUrl(imageUrl)
      const extraCount = (recipeSnapshot.extraImages || []).length
      const summary = [
        recipeSnapshot.portrait?.发型名称,
        recipeSnapshot.costume?.分类,
        recipeSnapshot.pose ? `${recipeSnapshot.pose.姿势名称}(${recipeSnapshot.pose.角度})` : null,
        extraCount ? `+${extraCount}附图` : null,
      ]
        .filter(Boolean)
        .join(' + ')
      addHistory({
        provider: providerUsed,
        model: modelUsed,
        prompt: finalPrompt,
        imageUrl,
        recipeSummary: summary || '自定义合成',
      })
      toast.success(`角色图生成完成 (${modelUsed})`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '调用失败')
    } finally {
      isGeneratingRef.current = false
      setIsGenerating(false)
    }
  }

  return (
    <StudioContext.Provider
      value={{
        recipe,
        apiConfig,
        history,
        customPrompt,
        setCustomPrompt,
        previewUrl,
        setPreviewUrl,
        isGenerating,
        generatingModel,
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
    </StudioContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components
export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error('useStudio must be used within StudioProvider')
  return ctx
}
