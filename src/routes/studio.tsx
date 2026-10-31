import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ChevronUpIcon,
  CodeXmlIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  FileUpIcon,
  ImagePlusIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  LinkIcon,
  LoaderCircleIcon,
  PersonStandingIcon,
  ScanSearchIcon,
  RotateCcwIcon,
  ShirtIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  UserRoundIcon,
  XIcon,
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { Field, Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  autoDetectComfyMappings,
  buildRecipePrompt,
  type ComfyCheckResult,
  type ComfyPresetId,
  checkComfyWorkflow,
  COMFYUI_WORKFLOW_TEMPLATES,
  detectComfyUi,
  fileToDataUrl,
  parseComfyWorkflowNodes,
  PROVIDER_META,
  stitchRecipeCanvas,
  STYLE_PRESETS,
} from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'
import type {
  ComfyUiParams,
  DoubaoParams,
  GeminiParams,
  GptParams,
  ImagePassMode,
  ImageProviderId,
  QwenParams,
} from '@/types/gallery'

export const Route = createFileRoute('/studio')({
  staticData: { title: 'AI 合成台' },
  component: StudioPage,
})

const PROVIDER_LIST: ImageProviderId[] = ['gemini', 'gpt', 'qwen', 'doubao', 'comfyui']

function StudioPage() {
  const {
    recipe,
    apiConfig,
    history,
    customPrompt,
    setCustomPrompt,
    previewUrl,
    setPreviewUrl,
    isGenerating,
    generatingModel,
    generationProgress,
    generationError,
    startGeneration,
    setPortrait,
    setCostume,
    setPose,
    addExtraImage,
    removeExtraImage,
    updateExtraImageName,
    updateApiConfig,
    updateProviderConfig,
    updateGptParams,
    updateGeminiParams,
    updateQwenParams,
    updateDoubaoParams,
    updateComfyUiParams,
    randomizeRecipe,
    removeHistoryItem,
    clearHistory,
  } = useStudio()
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const comfyFileInputRef = useRef<HTMLInputElement | null>(null)

  const activeProvider = apiConfig.activeProvider
  const providerMeta = PROVIDER_META[activeProvider]
  const providerCfg = apiConfig.providers[activeProvider]

  const defaultPrompt = buildRecipePrompt(recipe, apiConfig.stylePreset)
  const prompt = customPrompt ?? defaultPrompt
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [extraUrlInput, setExtraUrlInput] = useState('')
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [stitchModalUrl, setStitchModalUrl] = useState<string | null>(null)
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null)
  const [showComfyJsonModal, setShowComfyJsonModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [comfyCheck, setComfyCheck] = useState<(ComfyCheckResult & { info?: string }) | null>(null)
  const [checkingComfy, setCheckingComfy] = useState(false)

  const parsedComfyNodes = useMemo(
    () => parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson),
    [apiConfig.comfyuiParams.workflowJson]
  )

  const handleSelectComfyPreset = (preset: ComfyUiParams['workflowPreset']) => {
    setComfyCheck(null)
    if (preset === 'custom') {
      updateComfyUiParams({ workflowPreset: 'custom' })
      return
    }
    const tpl = COMFYUI_WORKFLOW_TEMPLATES[preset]
    updateComfyUiParams({
      workflowPreset: preset,
      workflowJson: JSON.stringify(tpl.workflow, null, 2),
      ...tpl.defaults,
    })
    toast.success(`已切换为：${tpl.label}`)
  }

  // 自动识别 ComfyUI 地址 + 检测工作流所需节点/模型是否在本机存在
  const handleCheckComfy = async () => {
    setCheckingComfy(true)
    setComfyCheck(null)
    try {
      const cfg = apiConfig.providers.comfyui
      const found = await detectComfyUi(cfg.baseUrl, cfg.apiKey)
      if (!found) {
        setComfyCheck({
          ok: false,
          errors: [
            `未找到可用的 ComfyUI 服务（已尝试：${cfg.baseUrl || '默认地址'}、127.0.0.1:8000、127.0.0.1:8188）。请确认 ComfyUI 已启动，并检查跨域 (CORS) 设置。`,
          ],
          warnings: [],
          fixes: [],
        })
        return
      }
      if (found.baseUrl !== cfg.baseUrl.trim().replace(/\/+$/, '')) {
        updateProviderConfig('comfyui', { baseUrl: found.baseUrl })
        toast.success(`已自动识别 ComfyUI 地址：${found.baseUrl}`)
      }
      const cp = apiConfig.comfyuiParams
      const result = await checkComfyWorkflow(found.baseUrl, cfg.apiKey, cp.workflowJson, [
        cp.portraitNodeId,
        cp.costumeNodeId,
        cp.poseNodeId,
        cp.stitchedNodeId,
      ])
      if (result.fixedJson) updateComfyUiParams({ workflowJson: result.fixedJson })
      setComfyCheck({ ...result, info: `${found.info}（${found.baseUrl}）` })
    } catch (e) {
      setComfyCheck({ ok: false, errors: [e instanceof Error ? e.message : '检测失败'], warnings: [], fixes: [] })
    } finally {
      setCheckingComfy(false)
    }
  }

  const handleComfyFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const info = parseComfyWorkflowNodes(text)
      if (!info.valid) {
        toast.error(info.error || '工作流 JSON 无效')
        return
      }
      const detected = autoDetectComfyMappings(text)
      setComfyCheck(null)
      updateComfyUiParams({
        workflowPreset: 'custom',
        workflowJson: text,
        ...detected,
      })
      setShowAdvanced(true)
      toast.success(
        `已导入工作流：识别到 ${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`
      )
    } catch {
      toast.error('读取 JSON 文件失败')
    }
  }

  const handleExportComfyJson = () => {
    try {
      const wf = JSON.parse(apiConfig.comfyuiParams.workflowJson)
      const cp = apiConfig.comfyuiParams
      if (cp.promptNodeId && cp.promptNodeId !== 'none' && wf[cp.promptNodeId]?.inputs) {
        const inputs = wf[cp.promptNodeId].inputs
        for (const field of ['prompt', 'text', 'string', 'positive']) {
          if (typeof inputs[field] === 'string') {
            inputs[field] = prompt
            break
          }
        }
      }
      const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `comfyui-workflow-${Date.now()}.api.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出 ComfyUI API 工作流 JSON')
    } catch {
      toast.error('当前工作流 JSON 格式有误，无法导出')
    }
  }

  const extraImages = recipe.extraImages || []
  const hasAnyRef = Boolean(
    recipe.portrait || recipe.costume || recipe.pose || extraImages.length > 0
  )

  const processFiles = async (files: File[]) => {
    const imgFiles = files.filter((f) => f.type.startsWith('image/'))
    if (!imgFiles.length) return
    try {
      for (const file of imgFiles) {
        const dataUrl = await fileToDataUrl(file)
        const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 16)
        addExtraImage({ name: baseName || '附加图', url: dataUrl })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '图片读取失败')
    }
  }

  // 支持在合成台直接 Cmd+V / Ctrl+V 粘贴剪贴板图片作为附加参考图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const items = Array.from(e.clipboardData?.items || [])
      const files = items
        .filter((it) => it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean) as File[]
      if (files.length > 0) {
        e.preventDefault()
        void processFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const handleRandom = async () => {
    const [posesRes, costumes, portraits] = await Promise.all([
      qc.ensureQueryData(posesQuery),
      qc.ensureQueryData(costumesQuery),
      qc.ensureQueryData(portraitsQuery),
    ])
    randomizeRecipe({
      poses: posesRes.items,
      costumes,
      portraits,
    })
  }

  const handleUploadFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    await processFiles(files)
    e.target.value = ''
  }

  const handleDropFiles = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    await processFiles(files)
  }

  const handleAddUrl = () => {
    const trimmed = extraUrlInput.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('data:image/')) {
      toast.error('请输入有效的 http(s):// 图片链接')
      return
    }
    addExtraImage({ name: '外部参考图', url: trimmed })
    setExtraUrlInput('')
    setShowUrlInput(false)
  }

  const handleOpenStitchModal = async () => {
    try {
      const url = await stitchRecipeCanvas(recipe)
      setStitchModalUrl(url)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '拼图失败')
    }
  }

  const handleGenerate = () => {
    void startGeneration(prompt)
  }

  return (
    <>
      <PageHeader
        title="AI 角色合成台"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">
              <KeyRoundIcon className="size-4" />
              {providerCfg.apiKey ? `${providerMeta.shortName} 已就绪` : '配置 API Key'}
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        {/* 左栏：参考图、模型参数与 Prompt */}
        <div
          className="flex flex-col gap-4 lg:col-span-7"
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDropFiles}
        >
          {/* 1. 参考图组合 */}
          <Section
            title="1. 参考图组合"
            className="md:grid-cols-1"
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleUploadFiles}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={handleRandom}
                >
                  <DicesIcon className="size-3.5" />
                  随机
                </Button>
                {hasAnyRef && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    onClick={handleOpenStitchModal}
                  >
                    <LayoutGridIcon className="size-3.5" />
                    参考拼图
                  </Button>
                )}
              </div>
            }
          >

            {/* 3 个核心图库槽位：手机端单列舒展展示，平板/桌面端三列并排 */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {/* 人像槽 */}
              <div className="relative flex items-center gap-2.5 rounded-xl bg-background p-2">
                {recipe.portrait ? (
                  <>
                    <img
                      src={`/${recipe.portrait.缩略图}`}
                      alt={recipe.portrait.标题}
                      className="h-11 w-9 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">人像</div>
                      <div className="truncate text-xs font-medium">{recipe.portrait.发型名称}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPortrait(null)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <Link
                    to="/portraits"
                    className="flex flex-1 items-center gap-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <UserRoundIcon className="size-4" />
                    </div>
                    <span className="truncate text-xs">+ 选人像</span>
                  </Link>
                )}
              </div>

              {/* 服装槽 */}
              <div className="relative flex items-center gap-2.5 rounded-xl bg-background p-2">
                {recipe.costume ? (
                  <>
                    <img
                      src={`/${recipe.costume.缩略图}`}
                      alt={recipe.costume.服装名称}
                      className="h-11 w-9 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">服装</div>
                      <div className="truncate text-xs font-medium">{recipe.costume.服装名称}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCostume(null)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <Link
                    to="/costumes"
                    className="flex flex-1 items-center gap-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <ShirtIcon className="size-4" />
                    </div>
                    <span className="truncate text-xs">+ 选服装</span>
                  </Link>
                )}
              </div>

              {/* 姿势槽 */}
              <div className="relative flex items-center gap-2.5 rounded-xl bg-background p-2">
                {recipe.pose ? (
                  <>
                    <img
                      src={`/${recipe.pose.缩略图}`}
                      alt={recipe.pose.姿势名称}
                      className="h-11 w-9 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">姿势 · {recipe.pose.角度}</div>
                      <div className="truncate text-xs font-medium">{recipe.pose.姿势名称}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPose(null)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <Link
                    to="/poses"
                    className="flex flex-1 items-center gap-2.5 py-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <div className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <PersonStandingIcon className="size-4" />
                    </div>
                    <span className="truncate text-xs">+ 选姿势</span>
                  </Link>
                )}
              </div>
            </div>

            {/* 附加参考图列表 + 可视化拖拽/粘贴上传框 */}
            <div className="space-y-2 pt-1">
              {extraImages.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {extraImages.map((img, idx) => (
                    <div
                      key={img.id}
                      className="flex items-center gap-2 rounded-xl border border-border/60 bg-background p-1.5"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="h-11 w-9 shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] text-muted-foreground">附图 #{idx + 1}</div>
                        <input
                          type="text"
                          value={img.name}
                          onChange={(e) => updateExtraImageName(img.id, e.target.value)}
                          placeholder="备注(如:配饰/背景)"
                          className="w-full truncate bg-transparent text-xs font-medium outline-none focus:underline"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeExtraImage(img.id)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <XIcon className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 显式虚线上传/拖拽/粘贴提示区 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-2.5 text-center transition sm:flex-row sm:justify-between ${
                  isDragging
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-border bg-background/60 text-muted-foreground hover:border-primary/50 hover:bg-background hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <ImagePlusIcon className="size-4 shrink-0" />
                  <span>
                    {isDragging
                      ? '松开鼠标添加附加参考图'
                      : '添加附加参考图：点击上传、拖拽图片至此，或直接按 Ctrl+V / ⌘V 粘贴'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowUrlInput((s) => !s)
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
                >
                  <LinkIcon className="size-3" />
                  输入图片 URL
                </button>
              </div>

              {showUrlInput && (
                <div className="flex items-center gap-2">
                  <Input
                    value={extraUrlInput}
                    onChange={(e) => setExtraUrlInput(e.target.value)}
                    placeholder="粘贴 https://... 图片地址"
                    className="bg-background text-xs"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUrl()}
                  />
                  <Button size="sm" onClick={handleAddUrl}>
                    添加
                  </Button>
                </div>
              )}
            </div>
          </Section>

          {/* 2. 协议、模型与可折叠高级参数 */}
          <Section
            title="2. 模型与参数"
            actions={
              <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
                <SlidersHorizontalIcon className="size-3.5" />
                高级参数
                {showAdvanced ? (
                  <ChevronUpIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
              </Button>
            }
          >
            <Field label="接口协议">
              <Select
                value={activeProvider}
                onValueChange={(v) => updateApiConfig({ activeProvider: v as ImageProviderId })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_LIST.map((pid) => (
                    <SelectItem key={pid} value={pid}>
                      {PROVIDER_META[pid].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {activeProvider === 'comfyui' ? (
              <Field label="工作流模板 (API 格式)">
                <div className="space-y-2">
                  <Select
                    value={apiConfig.comfyuiParams.workflowPreset}
                    onValueChange={(v) =>
                      handleSelectComfyPreset(v as ComfyUiParams['workflowPreset'])
                    }
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(COMFYUI_WORKFLOW_TEMPLATES) as ComfyPresetId[]).map((key) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {COMFYUI_WORKFLOW_TEMPLATES[key].label}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom" className="text-xs">
                        自定义工作流 (已导入 JSON)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex flex-wrap gap-1.5">
                    <input
                      ref={comfyFileInputRef}
                      type="file"
                      accept=".json,application/json"
                      onChange={handleComfyFileUpload}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => comfyFileInputRef.current?.click()}
                    >
                      <FileUpIcon className="size-3.5" />
                      导入 .json
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowComfyJsonModal(true)}
                    >
                      <CodeXmlIcon className="size-3.5" />
                      编辑 JSON
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleExportComfyJson}
                    >
                      <DownloadIcon className="size-3.5" />
                      导出 .json
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={handleCheckComfy}
                      disabled={checkingComfy}
                    >
                      {checkingComfy ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" />
                      ) : (
                        <ScanSearchIcon className="size-3.5" />
                      )}
                      检测本机模型
                    </Button>
                  </div>
                  {comfyCheck && (
                    <div
                      className={`space-y-1 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
                        comfyCheck.ok
                          ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
                          : 'border-destructive/40 bg-destructive/10 text-destructive'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold">
                        {comfyCheck.ok ? (
                          <CircleCheckIcon className="size-3.5" />
                        ) : (
                          <CircleAlertIcon className="size-3.5" />
                        )}
                        {comfyCheck.ok ? '工作流与本机模型/节点匹配，可以生成' : '检测未通过'}
                      </div>
                      {comfyCheck.info && <div className="opacity-80">{comfyCheck.info}</div>}
                      {comfyCheck.errors.map((m, i) => (
                        <div key={`e${i}`} className="whitespace-pre-wrap break-all">
                          • {m}
                        </div>
                      ))}
                      {comfyCheck.fixes.map((m, i) => (
                        <div key={`f${i}`} className="break-all">
                          ✓ {m}
                        </div>
                      ))}
                      {comfyCheck.warnings.map((m, i) => (
                        <div key={`w${i}`} className="break-all opacity-80">
                          ! {m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Field>
            ) : (
              <>
                <Field label="模型 ID">
                  <Select
                    value={providerCfg.model}
                    onValueChange={(v) => updateProviderConfig(activeProvider, { model: v })}
                  >
                    <SelectTrigger className="w-full font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerMeta.models.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {providerCfg.model === 'custom' && (
                  <Field label="自定义模型 ID">
                    <Input
                      value={providerCfg.customModel}
                      onChange={(e) =>
                        updateProviderConfig(activeProvider, { customModel: e.target.value })
                      }
                      placeholder="输入模型 ID"
                      className="bg-background font-mono text-xs"
                    />
                  </Field>
                )}
              </>
            )}

            <Field label="画风预设">
              <Select
                value={apiConfig.stylePreset}
                onValueChange={(v) => updateApiConfig({ stylePreset: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STYLE_PRESETS).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {activeProvider === 'comfyui' && (
              <>
                {!parsedComfyNodes.valid && (
                  <div className="col-span-full rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {parsedComfyNodes.error}
                  </div>
                )}

                <Field label="人像图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.portraitNodeId}
                    onValueChange={(v) => updateComfyUiParams({ portraitNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="服装图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.costumeNodeId}
                    onValueChange={(v) => updateComfyUiParams({ costumeNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="姿势图节点 (LoadImage)">
                  <Select
                    value={apiConfig.comfyuiParams.poseNodeId}
                    onValueChange={(v) => updateComfyUiParams({ poseNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">不绑定</SelectItem>
                      {parsedComfyNodes.imageNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="正向提示词节点 (Prompt)">
                  <Select
                    value={apiConfig.comfyuiParams.promptNodeId}
                    onValueChange={(v) => updateComfyUiParams({ promptNodeId: v })}
                  >
                    <SelectTrigger className="w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">保留工作流原提示词</SelectItem>
                      {parsedComfyNodes.promptNodes.map((n) => (
                        <SelectItem key={n.id} value={n.id} className="text-xs">
                          #{n.id} {n.title} ({n.field})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}

            {/* 展开的高级协议专属参数 */}
            {showAdvanced && (
              <>
                {activeProvider === 'gemini' && (
                  <>
                    <Field label="Gemini 协议模式">
                      <Select
                        value={apiConfig.geminiParams.endpointMode}
                        onValueChange={(v) =>
                          updateGeminiParams({ endpointMode: v as GeminiParams['endpointMode'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="native">Native (:generateContent)</SelectItem>
                          <SelectItem value="openai_chat">OpenAI Chat (/v1/chat/completions)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="宽高比 (aspectRatio)">
                      <Select
                        value={apiConfig.geminiParams.aspectRatio}
                        onValueChange={(v) =>
                          updateGeminiParams({ aspectRatio: v as GeminiParams['aspectRatio'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3:4">3:4</SelectItem>
                          <SelectItem value="9:16">9:16</SelectItem>
                          <SelectItem value="1:1">1:1</SelectItem>
                          <SelectItem value="4:3">4:3</SelectItem>
                          <SelectItem value="16:9">16:9</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="分辨率 (imageSize)">
                      <Select
                        value={apiConfig.geminiParams.imageSize}
                        onValueChange={(v) =>
                          updateGeminiParams({ imageSize: v as GeminiParams['imageSize'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1K">1K</SelectItem>
                          <SelectItem value="2K">2K</SelectItem>
                          <SelectItem value="4K">4K</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'gpt' && (
                  <>
                    <Field label="调用端点 (endpointMode)">
                      <Select
                        value={apiConfig.gptParams.endpointMode}
                        onValueChange={(v) =>
                          updateGptParams({ endpointMode: v as GptParams['endpointMode'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="images_edits_json">/v1/images/edits (JSON)</SelectItem>
                          <SelectItem value="responses">/v1/responses</SelectItem>
                          <SelectItem value="chat">/v1/chat/completions</SelectItem>
                          <SelectItem value="images_edits">/v1/images/edits (Multipart)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.gptParams.size}
                        onValueChange={(v) => updateGptParams({ size: v as GptParams['size'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1024x1536">1024x1536</SelectItem>
                          <SelectItem value="1024x1024">1024x1024</SelectItem>
                          <SelectItem value="1536x1024">1536x1024</SelectItem>
                          <SelectItem value="auto">auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="渲染质量 (quality)">
                      <Select
                        value={apiConfig.gptParams.quality}
                        onValueChange={(v) => updateGptParams({ quality: v as GptParams['quality'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="xhigh">xhigh</SelectItem>
                          <SelectItem value="max">max</SelectItem>
                          <SelectItem value="medium">medium</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                          <SelectItem value="auto">auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="参考还原度 (input_fidelity)">
                      <Select
                        value={apiConfig.gptParams.inputFidelity}
                        onValueChange={(v) =>
                          updateGptParams({ inputFidelity: v as GptParams['inputFidelity'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">high</SelectItem>
                          <SelectItem value="low">low</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="背景模式 (background)">
                      <Select
                        value={apiConfig.gptParams.background}
                        onValueChange={(v) =>
                          updateGptParams({ background: v as GptParams['background'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">auto</SelectItem>
                          <SelectItem value="transparent">transparent</SelectItem>
                          <SelectItem value="opaque">opaque</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="图片格式 (output_format)">
                      <Select
                        value={apiConfig.gptParams.outputFormat}
                        onValueChange={(v) =>
                          updateGptParams({ outputFormat: v as GptParams['outputFormat'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="png">png</SelectItem>
                          <SelectItem value="webp">webp</SelectItem>
                          <SelectItem value="jpeg">jpeg</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'qwen' && (
                  <>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.qwenParams.size}
                        onValueChange={(v) => updateQwenParams({ size: v as QwenParams['size'] })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1024*1536">1024*1536</SelectItem>
                          <SelectItem value="928*1664">928*1664</SelectItem>
                          <SelectItem value="1328*1328">1328*1328</SelectItem>
                          <SelectItem value="1664*928">1664*928</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="提示词扩写 (prompt_extend)">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.qwenParams.promptExtend ? '开启' : '关闭'}
                        </span>
                        <Switch
                          checked={apiConfig.qwenParams.promptExtend}
                          onCheckedChange={(v) => updateQwenParams({ promptExtend: v })}
                        />
                      </div>
                    </Field>
                    <Field label="反向提示词 (negative_prompt)">
                      <Input
                        value={apiConfig.qwenParams.negativePrompt}
                        onChange={(e) => updateQwenParams({ negativePrompt: e.target.value })}
                        placeholder="低分辨率，多余手指，扭曲"
                        className="bg-background text-xs"
                      />
                    </Field>
                  </>
                )}

                {activeProvider === 'doubao' && (
                  <>
                    <Field label="输出尺寸 (size)">
                      <Select
                        value={apiConfig.doubaoParams.size}
                        onValueChange={(v) =>
                          updateDoubaoParams({ size: v as DoubaoParams['size'] })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1728x2304">1728x2304</SelectItem>
                          <SelectItem value="2K">2K</SelectItem>
                          <SelectItem value="4K">4K</SelectItem>
                          <SelectItem value="1440x2560">1440x2560</SelectItem>
                          <SelectItem value="2048x2048">2048x2048</SelectItem>
                          <SelectItem value="2560x1440">2560x1440</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="组图模式 (sequential)">
                      <Select
                        value={apiConfig.doubaoParams.sequentialImageGeneration}
                        onValueChange={(v) =>
                          updateDoubaoParams({
                            sequentialImageGeneration:
                              v as DoubaoParams['sequentialImageGeneration'],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="disabled">disabled (单张)</SelectItem>
                          <SelectItem value="auto">auto (组图)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="返回格式 (response_format)">
                      <Select
                        value={apiConfig.doubaoParams.responseFormat}
                        onValueChange={(v) =>
                          updateDoubaoParams({
                            responseFormat: v as DoubaoParams['responseFormat'],
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="b64_json">b64_json</SelectItem>
                          <SelectItem value="url">url</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}

                {activeProvider === 'comfyui' && (
                  <>
                    <Field label="三合一拼图节点 (可选)">
                      <Select
                        value={apiConfig.comfyuiParams.stitchedNodeId}
                        onValueChange={(v) => updateComfyUiParams({ stitchedNodeId: v })}
                      >
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">不绑定</SelectItem>
                          {parsedComfyNodes.imageNodes.map((n) => (
                            <SelectItem key={n.id} value={n.id} className="text-xs">
                              #{n.id} {n.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="最长等待时间（秒）">
                      <Input
                        type="number"
                        min={60}
                        step={60}
                        value={apiConfig.comfyuiParams.timeoutSec}
                        onChange={(e) =>
                          updateComfyUiParams({ timeoutSec: Math.max(60, Number(e.target.value) || 600) })
                        }
                        className="bg-background text-xs"
                      />
                    </Field>
                    <Field label="随机种子 (seed)">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.comfyuiParams.randomizeSeed ? '每次随机种子' : '固定工作流种子'}
                        </span>
                        <Switch
                          checked={apiConfig.comfyuiParams.randomizeSeed}
                          onCheckedChange={(v) => updateComfyUiParams({ randomizeSeed: v })}
                        />
                      </div>
                    </Field>
                  </>
                )}

                {activeProvider !== 'comfyui' && (
                  <>
                    <Field label="图片传参方式">
                      <Select
                        value={apiConfig.imagePassMode}
                        onValueChange={(v) => updateApiConfig({ imagePassMode: v as ImagePassMode })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">URL</SelectItem>
                          <SelectItem value="base64">Base64</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="附带合成拼图">
                      <div className="flex h-9 items-center justify-between rounded-xl border bg-background px-3">
                        <span className="text-xs text-muted-foreground">
                          {apiConfig.sendStitchedSheet ? '同时发送拼图' : '仅发单图序列'}
                        </span>
                        <Switch
                          checked={apiConfig.sendStitchedSheet}
                          onCheckedChange={(v) => updateApiConfig({ sendStitchedSheet: v })}
                        />
                      </div>
                    </Field>
                  </>
                )}
              </>
            )}
          </Section>

          {/* 3. 提示词与生成按钮 */}
          <Section
            title="3. 提示词 (Prompt)"
            className="md:grid-cols-1"
            actions={
              <div className="flex items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setCustomPrompt(null)}>
                  <RotateCcwIcon className="size-3.5" />
                  重置
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(prompt)
                    toast.success('已复制')
                  }}
                >
                  <CopyIcon className="size-3.5" />
                  复制
                </Button>
              </div>
            }
          >
            <Textarea
              value={prompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={5}
              className="bg-background font-mono text-xs leading-relaxed"
            />

            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-11 w-full text-sm font-semibold"
            >
              {isGenerating ? (
                <>
                  <LoaderCircleIcon className="size-4 animate-spin" />
                  生成中…
                </>
              ) : (
                <>
                  <SparklesIcon className="size-4" />
                  生成角色图
                </>
              )}
            </Button>
          </Section>
        </div>

        {/* 右栏：专注展示 AI 生成结果与生成状态 */}
        <div className="lg:col-span-5">
          <Section
            title="生成结果"
            className="md:grid-cols-1"
            actions={
              previewUrl && !isGenerating ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={previewUrl} download="character-result.png">
                    <DownloadIcon className="size-3.5" />
                    下载图片
                  </a>
                </Button>
              ) : null
            }
          >
            <div className="relative flex min-h-[340px] items-center justify-center overflow-hidden rounded-2xl bg-background p-4 sm:min-h-[460px]">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <LoaderCircleIcon className="size-6 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold">正在生成角色图…</div>
                    {generatingModel && (
                      <Badge variant="secondary" className="font-mono text-[11px]">
                        {generatingModel}
                      </Badge>
                    )}
                    {generationProgress && (
                      <div className="w-56 space-y-1.5 pt-1">
                        <div className="text-xs text-foreground/80">{generationProgress.message}</div>
                        {generationProgress.percent !== undefined && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${generationProgress.percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <p className="pt-1 text-xs text-muted-foreground">
                      切换页面不会中断当前任务
                    </p>
                  </div>
                </div>
              ) : generationError ? (
                <div className="flex max-w-md flex-col items-center gap-2 text-center">
                  <CircleAlertIcon className="size-7 text-destructive" />
                  <div className="text-sm font-semibold text-destructive">生成失败</div>
                  <p className="whitespace-pre-wrap break-all text-left text-xs leading-relaxed text-muted-foreground">
                    {generationError}
                  </p>
                  {previewUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setZoomImageUrl(previewUrl)}>
                      查看上一张结果
                    </Button>
                  )}
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="生成结果"
                  onClick={() => setZoomImageUrl(previewUrl)}
                  title="点击放大查看"
                  className="max-h-[480px] w-auto cursor-zoom-in rounded-xl object-contain transition hover:opacity-95"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
                  <SparklesIcon className="size-7 opacity-35" />
                  <span className="text-xs">点击「生成角色图」后在此处展示生成结果</span>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>

      {/* 生成历史记录 */}
      {history.length > 0 && (
        <Section
          title={`生成记录 (${history.length})`}
          className="grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
          actions={
            <Button variant="ghost" size="sm" onClick={clearHistory}>
              <Trash2Icon className="size-3.5" />
              清空
            </Button>
          }
        >
          {history.map((h) => (
            <div
              key={h.id}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl bg-background p-2"
            >
              <div
                onClick={() => {
                  setPreviewUrl(h.imageUrl)
                  setZoomImageUrl(h.imageUrl)
                }}
                className="relative aspect-3/4 cursor-zoom-in overflow-hidden rounded-xl bg-muted"
              >
                <img
                  src={h.imageUrl}
                  alt={h.recipeSummary}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
                <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {h.model}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeHistoryItem(h.id)
                  }}
                  title="删除此记录"
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/65 p-1 text-white opacity-85 transition hover:bg-destructive hover:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </div>

              <div className="mt-2 space-y-1.5 px-0.5">
                <div className="truncate text-xs font-medium">{h.recipeSummary}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPrompt(h.prompt)
                      toast.success('已恢复该图提示词')
                    }}
                    className="flex h-7 items-center justify-center rounded-lg bg-muted text-[11px] font-medium whitespace-nowrap text-foreground transition hover:bg-muted/70"
                  >
                    复用词
                  </button>
                  <a
                    href={h.imageUrl}
                    download={`character-${h.id}.png`}
                    className="flex h-7 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-medium whitespace-nowrap text-primary transition hover:bg-primary/20"
                  >
                    下载
                  </a>
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* 生成结果全屏放大灯箱 */}
      <Dialog open={Boolean(zoomImageUrl)} onOpenChange={(o) => !o && setZoomImageUrl(null)}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-4xl overflow-y-auto p-4 sm:max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="text-base">生成结果大图预览</DialogTitle>
            {zoomImageUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={zoomImageUrl} download="character-result.png">
                  <DownloadIcon className="size-3.5" />
                  下载原图
                </a>
              </Button>
            )}
          </DialogHeader>
          {zoomImageUrl && (
            <div className="mt-2 flex items-center justify-center overflow-hidden rounded-xl bg-muted/60 p-2">
              <img
                src={zoomImageUrl}
                alt="大图预览"
                className="max-h-[78vh] w-auto rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 参考拼图独立弹窗（不占用主画布） */}
      <Dialog open={Boolean(stitchModalUrl)} onOpenChange={(o) => !o && setStitchModalUrl(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="text-base">参考图拼合卡片</DialogTitle>
            {stitchModalUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={stitchModalUrl} download="reference-sheet.jpg">
                  <DownloadIcon className="size-3.5" />
                  下载拼图
                </a>
              </Button>
            )}
          </DialogHeader>
          {stitchModalUrl && (
            <div className="mt-2 flex items-center justify-center overflow-hidden rounded-xl bg-muted p-2">
              <img
                src={stitchModalUrl}
                alt="参考拼图"
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ComfyUI API 工作流 JSON 编辑器弹窗 */}
      <Dialog open={showComfyJsonModal} onOpenChange={setShowComfyJsonModal}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row items-center justify-between pr-6">
            <DialogTitle className="text-base">ComfyUI API 工作流 JSON</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const info = parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson)
                if (!info.valid) {
                  toast.error(info.error || '工作流 JSON 无效')
                  return
                }
                const detected = autoDetectComfyMappings(apiConfig.comfyuiParams.workflowJson)
                updateComfyUiParams(detected)
                toast.success(
                  `已自动重新识别节点：${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`
                )
              }}
            >
              自动识别节点
            </Button>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            请在 ComfyUI 设置中开启「启用开发模式选项」，点击菜单中的「导出 (API)」获取 JSON 并粘贴于下方。
          </p>
          <Textarea
            value={apiConfig.comfyuiParams.workflowJson}
            onChange={(e) =>
              updateComfyUiParams({
                workflowPreset: 'custom',
                workflowJson: e.target.value,
              })
            }
            rows={18}
            className="font-mono text-xs leading-relaxed"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
