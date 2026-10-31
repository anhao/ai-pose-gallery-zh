import type { CostumeItem, PortraitItem, PoseItem, RecipeState } from '@/types/gallery'

export function referenceImageUrl(src: string): string {
  return /^(data:|https?:\/\/|\/)/i.test(src) ? src : `/${src}`
}

export function uploadedReferences(name: string, url: string, width: number, height: number, bytes: number) {
  const base = { id: crypto.randomUUID(), source: 'upload' as const, 原图: url, 缩略图: url, 检索: name }
  const portrait: PortraitItem = {
    ...base, 分区: '上传', 发长: '', 发型名称: name, 标题: name,
    宽: width, 高: height, 字节数: bytes, 精选: false, 热门: false,
  }
  const costume: CostumeItem = {
    ...base, 分类: '上传', 服装名称: name, 标签: [], 关键词: '', 预览图: url,
  }
  const pose: PoseItem = {
    ...base, 体系: '上传', 姿势编号: '', 分类: '上传', 姿势名称: name, 角度: '',
  }
  return { portrait, costume, pose }
}

export function recipeBackup(recipe: RecipeState): RecipeState {
  return {
    portrait: recipe.portrait?.source === 'upload' ? null : recipe.portrait,
    costume: recipe.costume?.source === 'upload' ? null : recipe.costume,
    pose: recipe.pose?.source === 'upload' ? null : recipe.pose,
    extraImages: [],
  }
}
