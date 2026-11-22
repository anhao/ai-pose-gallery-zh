import type { ExtraReferenceImage, GenerationHistoryItem } from '@/types/gallery'
import { parseParameterWorkflow, workflowIdentity } from './comfyWorkflowParameters'
import { referenceImageUrl } from './recipeImages'
import { isDualCharacter, recipeReferences } from './recipeCharacters'

export interface ComparisonReference { id: string; label: string; url: string }

/** Only the submitted record supplies references; never consult the current editor. */
export function comparisonReferences(result: GenerationHistoryItem): ComparisonReference[] {
  const snapshot = result.snapshot
  if (!snapshot?.recipe) return []
  const { recipe } = snapshot
  const workflowImages: ExtraReferenceImage[] = []
  const cp = snapshot.settings?.comfyuiParams
  const submitted = snapshot.submittedWorkflowJson && parseParameterWorkflow(snapshot.submittedWorkflowJson)
  const original = cp && parseParameterWorkflow(cp.workflowJson)
  const identity = recipe.workflowImagesIdentity
  if (result.provider === 'comfyui' && cp && submitted && original && identity &&
    (identity === workflowIdentity(cp.workflowJson) || identity === workflowIdentity(snapshot.submittedWorkflowJson!))) {
    const mapped = [cp.portraitNodeId, cp.costumeNodeId, cp.poseNodeId, cp.stitchedNodeId, ...(isDualCharacter(recipe) ? [cp.secondaryPortraitNodeId, cp.secondaryCostumeNodeId] : [])]
    for (const [nodeId, image] of Object.entries(recipe.workflowImages || {})) {
      const node = submitted[nodeId]
      if (mapped.includes(nodeId) || !node || node.class_type !== original[nodeId]?.class_type || typeof node.inputs.image !== 'string' || !node.inputs.image.trim() || node.inputs.image === '无') continue
      workflowImages.push({ ...image, id: nodeId })
    }
  }
  return recipeReferences(recipe, workflowImages).map((ref) => ({ id: ref.id, label: `图${ref.number} · ${ref.label} · ${ref.name}`, url: referenceImageUrl(ref.src) }))
}
