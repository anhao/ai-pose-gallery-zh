import type { GenerationHistoryItem } from '@/types/gallery'
import { parseParameterWorkflow, workflowIdentity } from './comfyWorkflowParameters'
import { poseImagePath, referenceImageUrl } from './recipeImages'

export interface ComparisonReference { id: string; label: string; url: string }

/** Only the submitted record supplies references; never consult the current editor. */
export function comparisonReferences(result: GenerationHistoryItem): ComparisonReference[] {
  const snapshot = result.snapshot
  if (!snapshot?.recipe) return []
  const { recipe } = snapshot
  const refs: ComparisonReference[] = []
  const add = (id: string, label: string, url?: string) => { if (url) refs.push({ id, label, url: referenceImageUrl(url) }) }
  if (recipe.portrait) add('portrait', `人像 · ${recipe.portrait.标题}`, recipe.portrait.原图 || recipe.portrait.缩略图)
  if (recipe.costume) add('costume', `服装 · ${recipe.costume.服装名称}`, recipe.costume.原图 || recipe.costume.预览图 || recipe.costume.缩略图)
  if (recipe.pose) add('pose', `姿势 · ${recipe.pose.姿势名称}${recipe.pose.useDepth ? '（深度图）' : ''}`, poseImagePath(recipe.pose))
  recipe.extraImages?.forEach((image, i) => add(`extra:${i}`, `附加参考 · ${image.name}`, image.url))
  const cp = snapshot.settings?.comfyuiParams
  const submitted = snapshot.submittedWorkflowJson && parseParameterWorkflow(snapshot.submittedWorkflowJson)
  const original = cp && parseParameterWorkflow(cp.workflowJson)
  const identity = recipe.workflowImagesIdentity
  if (result.provider === 'comfyui' && cp && submitted && original && identity &&
    (identity === workflowIdentity(cp.workflowJson) || identity === workflowIdentity(snapshot.submittedWorkflowJson!))) {
    const mapped = [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId]
    for (const [nodeId, image] of Object.entries(recipe.workflowImages || {})) {
      const node = submitted[nodeId]
      if (mapped.includes(nodeId) || !node || node.class_type !== original[nodeId]?.class_type || typeof node.inputs.image !== 'string' || !node.inputs.image.trim() || node.inputs.image === '无') continue
      add(`workflow:${nodeId}`, `工作流参考 · ${image.name}`, image.url)
    }
  }
  return refs
}
