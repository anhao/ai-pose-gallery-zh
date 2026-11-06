import type { RecipeState } from '@/types/gallery'
import { referenceImageUrl } from './recipeImages'

export async function durableImage(url: string): Promise<string> {
  if (url.startsWith('data:image/')) return url
  const response = await fetch(referenceImageUrl(url))
  if (!response.ok) throw new Error('图片下载失败')
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('引用不是图片')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}
export async function durableRecipe(recipe: RecipeState) {
  const next = structuredClone(recipe)
  for (const item of [next.portrait, next.costume, next.pose]) {
    if (item?.source === 'upload') {
      item.原图 = await durableImage(item.原图)
      item.缩略图 = item.原图
      if ('预览图' in item) item.预览图 = item.原图
    }
  }
  for (const image of [...(next.extraImages || []), ...Object.values(next.workflowImages || {})]) image.url = await durableImage(image.url)
  return next
}
