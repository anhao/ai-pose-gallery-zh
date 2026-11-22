import type { ApiConfig, CharacterLayout, CharacterReference, CharacterSlot, ComfyUiParams, ExtraReferenceImage, PoseItem, RecipeState } from '@/types/gallery'
import { parseParameterWorkflow, workflowIdentity } from './comfyWorkflowParameters'
import { poseImagePath } from './recipeImages'

export const CHARACTER_LAYOUTS: ReadonlyArray<{ value: CharacterLayout; label: string; a: string; b: string }> = [
  { value: 'a-left', label: 'A 在左，B 在右', a: '画面左侧', b: '画面右侧' },
  { value: 'a-right', label: 'A 在右，B 在左', a: '画面右侧', b: '画面左侧' },
  { value: 'a-front', label: 'A 在前，B 在后', a: '画面前方', b: '画面后方' },
  { value: 'a-back', label: 'A 在后，B 在前', a: '画面后方', b: '画面前方' },
]

export const isDualCharacter = (recipe: RecipeState): boolean => recipe.characterMode === 'dual'

export function comfyRecipeMappedImageNodes(recipe: RecipeState, params: ComfyUiParams): string[] {
  const ids = [params.portraitNodeId, params.costumeNodeId, params.poseNodeId, params.stitchedNodeId]
  if (isDualCharacter(recipe)) ids.push(params.secondaryPortraitNodeId || '', params.secondaryCostumeNodeId || '')
  return ids.filter((id) => id && id !== 'none')
}

export function comfyRecipeWorkflowImages(recipe: RecipeState, params: ComfyUiParams): Record<string, ExtraReferenceImage> {
  if (recipe.workflowImagesIdentity !== workflowIdentity(params.workflowJson)) return {}
  const workflow = parseParameterWorkflow(params.workflowJson)
  const mapped = comfyRecipeMappedImageNodes(recipe, params)
  return Object.fromEntries(Object.entries(recipe.workflowImages || {}).filter(([id]) =>
    !mapped.includes(id) && typeof workflow?.[id]?.inputs.image === 'string',
  ))
}

export function characterReferences(recipe: RecipeState, slot: CharacterSlot = 'a'): CharacterReference {
  return slot === 'a' ? { portrait: recipe.portrait, costume: recipe.costume }
    : { portrait: recipe.secondaryCharacter?.portrait ?? null, costume: recipe.secondaryCharacter?.costume ?? null }
}

export function withCharacterReferences(recipe: RecipeState, slot: CharacterSlot, patch: Partial<CharacterReference>): RecipeState {
  return slot === 'a' ? { ...recipe, ...patch }
    : { ...recipe, secondaryCharacter: { ...characterReferences(recipe, 'b'), ...patch } }
}

export function recipeCharacters(recipe: RecipeState) {
  const dual = isDualCharacter(recipe)
  const layout = CHARACTER_LAYOUTS.find((item) => item.value === recipe.characterLayout) || CHARACTER_LAYOUTS[0]
  const slots: CharacterSlot[] = dual ? ['a', 'b'] : ['a']
  return slots.map((slot) => ({ ...characterReferences(recipe, slot), slot, label: dual ? `角色 ${slot.toUpperCase()}` : '人物', position: dual ? layout[slot] : '' }))
}

export function isDualPose(pose: PoseItem | null | undefined): boolean {
  return Boolean(pose && /双人/.test(`${pose.体系} ${pose.分类}`))
}

export function withRecipePose(recipe: RecipeState, pose: PoseItem | null): RecipeState {
  return { ...recipe, pose, ...(isDualPose(pose) ? { characterMode: 'dual' as const } : {}) }
}

export function restoreRecipe(value: unknown): RecipeState {
  const raw = value && typeof value === 'object' ? value as Partial<RecipeState> : {}
  return {
    portrait: raw.portrait ?? null, costume: raw.costume ?? null, pose: raw.pose ?? null,
    characterMode: raw.characterMode === 'dual' || (!raw.characterMode && isDualPose(raw.pose)) ? 'dual' : 'single',
    characterLayout: CHARACTER_LAYOUTS.some((item) => item.value === raw.characterLayout) ? raw.characterLayout : 'a-left',
    secondaryCharacter: { portrait: raw.secondaryCharacter?.portrait ?? null, costume: raw.secondaryCharacter?.costume ?? null },
    extraImages: Array.isArray(raw.extraImages) ? raw.extraImages : [],
    workflowImages: raw.workflowImages ?? {}, workflowImagesIdentity: raw.workflowImagesIdentity,
  }
}

export interface RecipeReference {
  id: string
  number: number
  kind: 'portrait' | 'costume' | 'pose' | 'workflow' | 'extra'
  character?: CharacterSlot
  label: string
  name: string
  src: string
}

/** The request, prompt, collage and history all use this exact image order. */
export function recipeReferences(recipe: RecipeState, workflowImages: ExtraReferenceImage[] = []): RecipeReference[] {
  const refs: Omit<RecipeReference, 'number'>[] = []
  const addWorkflow = (image: ExtraReferenceImage) => refs.push({ id: `workflow-${image.id}`, kind: 'workflow', label: image.role === 'character_sheet' ? '角色设定' : '工作流参考', name: image.name || '工作流参考', src: image.url })
  workflowImages.filter((image) => image.role === 'character_sheet').forEach(addWorkflow)
  for (const character of recipeCharacters(recipe)) {
    const prefix = isDualCharacter(recipe) ? `${character.label} · ` : ''
    const suffix = character.position ? `（${character.position}）` : ''
    if (character.portrait) refs.push({ id: `${character.slot}-portrait`, kind: 'portrait', character: character.slot, label: `${prefix}人像${suffix}`, name: character.portrait.标题, src: character.portrait.原图 || character.portrait.缩略图 })
    if (character.costume) refs.push({ id: `${character.slot}-costume`, kind: 'costume', character: character.slot, label: `${prefix}服装${suffix}`, name: character.costume.服装名称, src: character.costume.预览图 || character.costume.原图 || character.costume.缩略图 })
  }
  if (recipe.pose) refs.push({ id: 'pose', kind: 'pose', label: isDualCharacter(recipe) ? '共享姿势' : '姿势', name: `${recipe.pose.姿势名称}（${recipe.pose.角度}${recipe.pose.useDepth ? ' · 深度图' : ''}）`, src: poseImagePath(recipe.pose) })
  workflowImages.filter((image) => image.role !== 'character_sheet').forEach(addWorkflow)
  for (const image of recipe.extraImages || []) refs.push({ id: `extra-${image.id}`, kind: 'extra', label: '附加参考', name: image.name || '补充参考', src: image.url })
  return refs.map((ref, index) => ({ ...ref, number: index + 1 }))
}

export function characterRecipeErrors(recipe: RecipeState, config?: Pick<ApiConfig, 'activeProvider' | 'comfyuiParams'>): string[] {
  if (!isDualCharacter(recipe)) return []
  const errors = recipeCharacters(recipe).filter((character) => !character.portrait).map((character) => `请为${character.label}选择或上传人像`)
  if (config?.activeProvider === 'pixai') errors.unshift('PixAI 当前接入固定使用人像、服装、姿势三图，暂不支持双角色。请切换其他接口或使用单人模式')
  if (config?.activeProvider === 'comfyui') {
    const cp = config.comfyuiParams
    const mappings = [
      { label: '角色 A 人像', id: cp.portraitNodeId, required: true },
      { label: '角色 A 服装', id: cp.costumeNodeId, required: Boolean(recipe.costume) },
      { label: '角色 B 人像', id: cp.secondaryPortraitNodeId, required: true },
      { label: '角色 B 服装', id: cp.secondaryCostumeNodeId, required: Boolean(recipe.secondaryCharacter?.costume) },
      { label: '共享姿势', id: cp.poseNodeId, required: Boolean(recipe.pose) },
      { label: '参考拼图', id: cp.stitchedNodeId, required: false },
    ]
    for (const entry of mappings.filter((item) => item.required && (!item.id || item.id === 'none'))) errors.push(`双人工作流需要映射${entry.label}节点`)
    const ids = mappings.filter((item) => item.id && item.id !== 'none').map((item) => item.id)
    if (new Set(ids).size !== ids.length) errors.push('双人工作流的人像、服装、姿势和拼图必须映射到不同的图片节点')
  }
  return errors
}
