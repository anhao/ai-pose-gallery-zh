import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'

export type ReferenceSlot = 'portrait' | 'costume' | 'pose'
export type RandomScope = 'similar' | 'all'
export interface ReferencePools { portraits?: PortraitItem[]; costumes?: CostumeItem[]; poses?: PoseItem[] }

/** Pools are already filtered by the current safety setting. */
export function randomSlot(recipe: RecipeState, slot: ReferenceSlot, scope: RandomScope, pools: ReferencePools, useDepth: boolean): RecipeState | null {
  const current = recipe[slot]
  if (scope === 'similar' && current?.source === 'upload') return null
  let candidates: Array<PortraitItem | CostumeItem | PoseItem>
  if (slot === 'portrait') {
    const selected = recipe.portrait
    candidates = (pools.portraits || []).filter((item) => item.source !== 'upload' && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.分区 === selected.分区 && item.发长 === selected.发长)))
  } else if (slot === 'costume') {
    const selected = recipe.costume
    candidates = (pools.costumes || []).filter((item) => item.source !== 'upload' && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.source === selected.source && (item.一级分类 || '现实') === (selected.一级分类 || '现实') && item.分类 === selected.分类)))
  } else {
    const selected = recipe.pose
    candidates = (pools.poses || []).filter((item) => item.source !== 'upload' && item.id !== current?.id &&
      (scope === 'all' || !selected || (item.体系 === selected.体系 && item.分类 === selected.分类)))
  }
  if (!candidates.length) return null
  const picked = candidates[Math.floor(Math.random() * candidates.length)]
  return { ...recipe, [slot]: slot === 'pose' ? { ...picked, useDepth } : picked }
}
