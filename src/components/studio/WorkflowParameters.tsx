import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { toast } from '@/lib/notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getWorkflowControls, getWorkflowImages, validControlValue, workflowIdentity, type WorkflowControl } from '@/lib/comfyWorkflowParameters'
import { fetchComfyObjectInfo, fileToDataUrl } from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'
import type { WorkflowScalar } from '@/types/gallery'

function ParameterField({ control, value, overridden, onChange, onReset }: { control: WorkflowControl; value: WorkflowScalar; overridden: boolean; onChange: (value: WorkflowScalar) => void; onReset: () => void }) {
  const [numberDraft, setNumberDraft] = useState(String(value))
  const id = `workflow-${control.key}`
  const inputClass = 'min-h-11 w-full min-w-0 max-w-full rounded-md border bg-background px-3 py-2 text-sm'
  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={id} className="min-w-0 flex-1 break-words text-xs font-medium">{control.group && <span className="mb-1 block font-normal text-muted-foreground">{control.group}</span>}{control.label}</label>
      <Button type="button" size="sm" variant="ghost" className="min-h-11 shrink-0" aria-label={`恢复${control.label}默认值`} disabled={!overridden} onClick={onReset}>恢复默认</Button>
    </div>
    {control.type === 'boolean' ? <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />
      : control.type === 'enum' ? <select id={id} className={inputClass} value={JSON.stringify(value)} onChange={(event) => onChange(JSON.parse(event.target.value))}>{control.options?.map((option) => <option key={JSON.stringify(option)} value={JSON.stringify(option)}>{control.optionLabels?.[JSON.stringify(option)] || String(option)}</option>)}</select>
      : control.type === 'number' ? <Input id={id} className="min-h-11" type="number" min={control.min} max={control.max} step={control.step ?? 'any'} value={numberDraft} onChange={(event) => setNumberDraft(event.target.value)} onBlur={() => { const parsed = numberDraft.trim() ? Number(numberDraft) : NaN; if (validControlValue(control, parsed)) onChange(parsed); else { setNumberDraft(String(value)); toast.error('请输入参数允许范围内的数字') } }} />
      : control.multiline ? <Textarea id={id} value={String(value)} rows={3} onChange={(event) => onChange(event.target.value)} />
      : <Input id={id} className="min-h-11" value={String(value)} onChange={(event) => onChange(event.target.value)} />}
    <p className="break-words text-xs text-muted-foreground">{control.description || (overridden ? '已覆盖工作流默认值' : '沿用工作流默认值')}{overridden && <span className="mt-1 block font-medium text-primary">已修改</span>}</p>
  </div>
}

export function WorkflowParameters({ onPreview, onUploadingChange }: { onPreview: (url: string) => void; onUploadingChange: (id: string | null) => void }) {
  const { apiConfig, recipe, updateComfyUiParams, setWorkflowImage } = useStudio()
  const cp = apiConfig.comfyuiParams
  const endpoint = apiConfig.providers.comfyui
  const identity = workflowIdentity(cp.workflowJson)
  const currentIdentityRef = useRef(identity)
  const imageInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const readEpoch = useRef(0)
  const [uploading, setUploading] = useState<string | null>(null)
  useEffect(() => {
    currentIdentityRef.current = identity
    // 工作流切换使正在读取的文件失效，同时解除生成按钮的占用。
    // oxlint-disable-next-line react/set-state-in-effect
    setUploading(null)
    onUploadingChange(null)
    return () => {
      currentIdentityRef.current = ''
      readEpoch.current += 1
      onUploadingChange(null)
    }
  }, [identity, onUploadingChange])
  const { data: schemas, isPending, error, refetch } = useQuery({
    queryKey: ['comfy-widget-schema', endpoint.baseUrl, endpoint.apiKey, identity],
    queryFn: () => fetchComfyObjectInfo(endpoint.baseUrl, endpoint.apiKey, cp.workflowJson),
    enabled: Boolean(identity), retry: false, staleTime: 60_000,
  })
  const images = getWorkflowImages(cp.workflowJson, [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId], schemas)
  const excluded = new Set<string>()
  // 图片和主提示词由各自上传、编辑入口管理。
  for (const image of images) excluded.add(`${image.nodeId}.image`)
  for (const nodeId of [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId]) excluded.add(`${nodeId}.image`)
  for (const input of ['prompt', 'text', 'string', 'positive']) excluded.add(`${cp.promptNodeId}.${input}`)
  const controls = getWorkflowControls(cp.workflowJson, schemas || {}, excluded)
  const saved = cp.parameterOverrides?.workflowId === identity ? cp.parameterOverrides.values || {} : {}
  const workflowImages = recipe.workflowImagesIdentity === identity ? recipe.workflowImages || {} : {}
  const change = (control: WorkflowControl, value?: WorkflowScalar) => {
    const values = { ...saved, [control.nodeId]: { ...saved[control.nodeId] } }
    if (value === undefined || value === control.value) delete values[control.nodeId][control.input]
    else values[control.nodeId][control.input] = value
    if (!Object.keys(values[control.nodeId]).length) delete values[control.nodeId]
    updateComfyUiParams({ parameterOverrides: { workflowId: identity, values } })
  }
  const renderControl = (control: WorkflowControl) => <ParameterField key={control.type === 'number' ? `${control.key}:${saved[control.nodeId]?.[control.input] ?? control.value}` : control.key} control={control} value={saved[control.nodeId]?.[control.input] ?? control.value} overridden={Object.hasOwn(saved[control.nodeId] || {}, control.input)} onChange={(value) => change(control, value)} onReset={() => change(control)} />
  const upload = async (event: ChangeEvent<HTMLInputElement>, nodeId: string, role?: 'character_sheet') => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (uploading !== null) return
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return }
    const startedIdentity = identity
    const startedEpoch = ++readEpoch.current
    setUploading(nodeId)
    onUploadingChange(`workflow-${nodeId}`)
    try {
      const url = await fileToDataUrl(file)
      if (currentIdentityRef.current !== startedIdentity || startedEpoch !== readEpoch.current) return
      setWorkflowImage(nodeId, { id: crypto.randomUUID(), name: file.name, url, role }, startedIdentity)
    } catch {
      if (currentIdentityRef.current === startedIdentity && startedEpoch === readEpoch.current) toast.error('图片读取失败，已保留原图，请重新选择')
    } finally {
      if (currentIdentityRef.current === startedIdentity && startedEpoch === readEpoch.current) { setUploading(null); onUploadingChange(null) }
    }
  }
  return <div className="col-span-full min-w-0 space-y-4 break-words rounded-xl border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">工作流高级参数</h3><Button type="button" size="sm" variant="ghost" className="min-h-11" disabled={!Object.keys(saved).length} onClick={() => updateComfyUiParams({ parameterOverrides: { workflowId: identity, values: {} } })}>全部恢复默认</Button></div>
    <p className="text-xs text-muted-foreground">按当前 ComfyUI 节点定义显示；未修改的参数沿用导入 API。</p>
    {images.length > 0 && <div className="grid gap-4 sm:grid-cols-2">{images.map((image) => {
      const selected = workflowImages[image.nodeId]
      const inputId = `workflow-image-${image.nodeId}`
      return <div key={image.nodeId} className="min-w-0 space-y-2 rounded-xl bg-background p-3" onDrop={(event) => { event.preventDefault(); event.stopPropagation() }}>
        <div className="block text-sm font-medium">{image.label}{image.optional ? '（可选）' : '（可替换）'}</div>
        {selected && <button type="button" className="block w-full cursor-zoom-in" onClick={() => onPreview(selected.url)} aria-label={`预览${image.label}`}><img src={selected.url} alt={image.label} className="h-28 w-full rounded-lg object-contain" /></button>}
        <input id={inputId} ref={(element) => { imageInputs.current[image.nodeId] = element }} hidden type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => void upload(event, image.nodeId, image.role)} aria-label={`选择${image.label}`} />
        <Button type="button" variant="outline" className="min-h-11" disabled={uploading !== null} onClick={() => imageInputs.current[image.nodeId]?.click()}>{selected ? '替换图片' : '选择图片'}</Button>
        {selected && <><p className="break-all text-xs" title={selected.name}>{selected.name}</p><p className="text-xs text-muted-foreground">已选择，生成时上传</p></>}
        {uploading === image.nodeId && <p role="status" className="text-xs">正在读取图片…</p>}
        {selected ? <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={uploading !== null} aria-label={`清除${image.label}`} onClick={() => setWorkflowImage(image.nodeId, null, identity)}>清除图片</Button> : <p className="text-xs text-muted-foreground">{image.optional ? '未选择（可选），可添加参考图片。' : '默认沿用工作流原图；选择后替换，清除后恢复原图。'}{image.role === 'character_sheet' && ' 可选择完整角色设定集，人物身份与外观以此图为准。'}</p>}
      </div>
    })}</div>}
    {isPending && identity && <p role="status" className="text-xs text-muted-foreground">正在读取节点参数…</p>}
    {error && <div role="status" className="text-xs text-destructive">节点参数读取失败：{error.message}<Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => void refetch()}>重试</Button></div>}
    {controls.some((control) => control.recommended) && <div className="grid gap-4 sm:grid-cols-2">{controls.filter((control) => control.recommended).map(renderControl)}</div>}
    {controls.some((control) => !control.recommended) && <details><summary className="min-h-11 cursor-pointer py-2 text-sm">其他可调参数（{controls.filter((control) => !control.recommended).length}）</summary><div className="grid gap-4 pt-3 sm:grid-cols-2">{controls.filter((control) => !control.recommended).map(renderControl)}</div></details>}
    {schemas && !controls.length && <p className="text-xs text-muted-foreground">此工作流没有可编辑的普通参数。</p>}
  </div>
}
