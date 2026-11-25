import type { WorkflowParameterOverrides, WorkflowScalar } from '@/types/gallery'
import { t } from '@/i18n'

export interface ParameterNode {
  class_type: string
  inputs: Record<string, unknown>
  _meta?: { title?: string; studio?: { hiddenInputs?: string[]; controls?: Array<{ input: string; label?: string; description?: string; group?: string; options?: Array<WorkflowScalar | { value: WorkflowScalar; label: string }> }>; imageRole?: string; referenceCombinations?: string[][] } }
}
export type ParameterWorkflow = Record<string, ParameterNode>
export type ComfyObjectInfo = Record<string, { input?: { required?: Record<string, unknown>; optional?: Record<string, unknown>; hidden?: Record<string, unknown> }; output?: string[] }>
export interface WorkflowControl {
  key: string; nodeId: string; input: string; label: string; description?: string; group?: string
  type: 'boolean' | 'number' | 'string' | 'enum'; value: WorkflowScalar; recommended: boolean
  options?: WorkflowScalar[]; optionLabels?: Record<string, string>; min?: number; max?: number; step?: number; integer?: boolean; multiline?: boolean
}

export function parseParameterWorkflow(json: string): ParameterWorkflow | null {
  try {
    const value = JSON.parse(json)
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) return null
    if (!Object.values(value).every((node: unknown) => node && typeof node === 'object' && 'class_type' in node && typeof node.class_type === 'string' && 'inputs' in node && node.inputs && typeof node.inputs === 'object' && !Array.isArray(node.inputs))) return null
    return value
  } catch { return null }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? ''
}

export function workflowIdentity(json: string): string {
  const workflow = parseParameterWorkflow(json)
  if (!workflow) return ''
  const value = canonical(workflow)
  let a = 2166136261, b = 5381
  for (let i = 0; i < value.length; i++) { a = Math.imul(a ^ value.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ value.charCodeAt(i) }
  return `${value.length}-${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`
}

const scalar = (value: unknown): value is WorkflowScalar => typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))

export function getWorkflowControls(json: string, schemas: ComfyObjectInfo, excluded = new Set<string>()): WorkflowControl[] {
  const workflow = parseParameterWorkflow(json)
  if (!workflow) return []
  const controls: WorkflowControl[] = []
  for (const [nodeId, node] of Object.entries(workflow)) {
    const schema = schemas[node.class_type]?.input
    const declaredHidden = node._meta?.studio?.hiddenInputs
    const hiddenInputs = Array.isArray(declaredHidden) && declaredHidden.every((input) => typeof input === 'string') ? new Set(declaredHidden) : new Set<string>()
    for (const [input, value] of Object.entries(node.inputs)) {
      if (!scalar(value) || hiddenInputs.has(input) || excluded.has(`${nodeId}.${input}`) || Object.hasOwn(schema?.hidden || {}, input)) continue
      const definition = schema?.required?.[input] ?? schema?.optional?.[input]
      if (!Array.isArray(definition)) continue
      const [kind, rawSettings] = definition
      const settings = rawSettings && typeof rawSettings === 'object' ? rawSettings as Record<string, unknown> : {}
      if (settings.forceInput || settings.hidden || settings.socket || settings.image_upload) continue
      const annotations = node._meta?.studio?.controls
      const annotation = Array.isArray(annotations) ? annotations.find((control) => control && typeof control === 'object' && !Array.isArray(control) && typeof control.input === 'string' && control.input === input) : undefined
      let type: WorkflowControl['type']
      let options: WorkflowScalar[] | undefined
      const schemaOptions = Array.isArray(kind) ? kind : kind === 'COMBO' && Array.isArray(settings.options) ? settings.options : undefined
      if (schemaOptions && schemaOptions.every(scalar)) { type = 'enum'; options = schemaOptions; if (!options.some((option) => option === value)) continue }
      else if (kind === 'BOOLEAN' && typeof value === 'boolean') type = 'boolean'
      else if ((kind === 'INT' || kind === 'FLOAT') && typeof value === 'number') type = 'number'
      else if (kind === 'STRING' && typeof value === 'string') type = 'string'
      else continue
      const optionLabels: Record<string, string> = {}
      if (Array.isArray(annotation?.options)) {
        const suggested = annotation.options.flatMap((option) => {
          if (!scalar(option) && (!option || typeof option !== 'object' || Array.isArray(option) || typeof option.label !== 'string' || !scalar(option.value))) return []
          const candidate = scalar(option) ? option : option.value
          if (!scalar(candidate) || typeof candidate !== typeof value || (options && !options.includes(candidate))) return []
          if (typeof candidate === 'number' && ((kind === 'INT' && !Number.isInteger(candidate)) || (typeof settings.min === 'number' && candidate < settings.min) || (typeof settings.max === 'number' && candidate > settings.max))) return []
          if (!scalar(option) && typeof option?.label === 'string') optionLabels[JSON.stringify(candidate)] = option.label
          return [candidate]
        })
        if (suggested.length && suggested.includes(value)) { options = suggested; type = 'enum' }
      }
      controls.push({ key: `${nodeId}.${input}`, nodeId, input, value, type, options, optionLabels,
        label: typeof annotation?.label === 'string' ? annotation.label : `${node._meta?.title || node.class_type} · ${input}`,
        description: typeof annotation?.description === 'string' ? annotation.description : undefined, group: typeof annotation?.group === 'string' ? annotation.group : undefined, recommended: Boolean(annotation),
        min: typeof settings.min === 'number' ? settings.min : undefined,
        max: typeof settings.max === 'number' ? settings.max : undefined,
        step: typeof settings.step === 'number' ? settings.step : kind === 'INT' ? 1 : undefined,
        integer: kind === 'INT', multiline: Boolean(settings.multiline),
      })
    }
  }
  return controls.sort((a, b) => Number(b.recommended) - Number(a.recommended))
}

export function validControlValue(control: WorkflowControl, value: unknown): value is WorkflowScalar {
  if (!scalar(value) || typeof value !== typeof control.value) return false
  if (control.options && !control.options.includes(value)) return false
  if (typeof value === 'number' && ((control.integer && !Number.isInteger(value)) || (control.min !== undefined && value < control.min) || (control.max !== undefined && value > control.max))) return false
  return true
}

export function applyWorkflowOverrides(json: string, saved?: WorkflowParameterOverrides, schemas?: ComfyObjectInfo): string {
  const workflow = parseParameterWorkflow(json)
  if (!workflow || !saved || !schemas || saved.workflowId !== workflowIdentity(json)) return json
  const controls = new Map(getWorkflowControls(json, schemas).map((control) => [control.key, control]))
  for (const [nodeId, fields] of Object.entries(saved.values || {})) {
    const node = workflow[nodeId]
    if (!node || !fields || typeof fields !== 'object') continue
    for (const [input, value] of Object.entries(fields)) {
      if (!Object.hasOwn(node.inputs, input) || !scalar(node.inputs[input]) || !scalar(value) || typeof node.inputs[input] !== typeof value) continue
      const control = controls.get(`${nodeId}.${input}`)
      if (!control || !validControlValue(control, value)) continue
      node.inputs[input] = value
    }
  }
  return JSON.stringify(workflow, null, 2)
}

export function getWorkflowImages(json: string, mappedNodeIds: string[], schemas?: ComfyObjectInfo) {
  return Object.entries(parseParameterWorkflow(json) || {}).filter(([nodeId, node]) => {
    if (mappedNodeIds.includes(nodeId) || typeof node.inputs.image !== 'string') return false
    const definition = schemas?.[node.class_type]?.input?.required?.image ?? schemas?.[node.class_type]?.input?.optional?.image
    return /^LoadImage(?:Goohai)?$/.test(node.class_type) || (schemas?.[node.class_type]?.output?.includes('IMAGE') && Array.isArray(definition) && Boolean((definition[1] as Record<string, unknown> | undefined)?.image_upload))
  }).map(([nodeId, node]) => ({ nodeId, role: node._meta?.studio?.imageRole === 'character_sheet' ? 'character_sheet' as const : undefined, label: node._meta?.studio?.imageRole === 'character_sheet' ? t('角色设定集') : typeof node._meta?.title === 'string' ? node._meta.title : `参考图 · ${nodeId}`, optional: node.class_type === 'LoadImageGoohai' })).sort((a, b) => Number(b.role === 'character_sheet') - Number(a.role === 'character_sheet'))
}

export function validateReferenceCombinations(json: string, uploadedNodeIds: string[]): string | null {
  const workflow = parseParameterWorkflow(json) || {}
  const declarations = Object.values(workflow).map((node) => node._meta?.studio?.referenceCombinations).filter((value): value is string[][] => Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row) && row.every((id) => typeof id === 'string')))
  const selected = JSON.stringify([...new Set(uploadedNodeIds)].sort())
  for (const combinations of declarations) {
    if (combinations.some((combination) => JSON.stringify([...new Set(combination)].sort()) === selected)) continue
    const label = (id: string) => workflow[id]?._meta?.studio?.imageRole === 'character_sheet' ? t('角色设定集') : workflow[id]?._meta?.title || t('参考图 #{id}', { id })
    return t('当前参考图组合不受此工作流支持，可用组合：{list}。', { list: combinations.map((combination) => combination.map(label).join('＋')).join('、') })
  }
  return null
}
