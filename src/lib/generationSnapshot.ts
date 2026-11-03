import type { ApiConfig, GenerationSnapshot, RecipeState } from '@/types/gallery'
import { durableRecipe } from './persistentImages'
export { durableImage } from './persistentImages'

export async function snapshotGeneration(recipe: RecipeState, config: ApiConfig, prompt: string): Promise<GenerationSnapshot> {
  const {providers, ...settings} = structuredClone(config)
  const models = Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, {model: value.model, customModel: value.customModel}])) as GenerationSnapshot['models']
  return {recipe: await durableRecipe(recipe), prompt, settings, models}
}
