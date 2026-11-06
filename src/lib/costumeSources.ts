import type { CostumeItem } from '@/types/gallery'

const SHISEI_REPOSITORY = 'https://github.com/wquguru/shisei'
const SHISEI_REVISION = '8f61ceab10e45f8d3afd254900903733a0ba76ee'
export const SHISEI_SOURCE_URLS = {
  repository: SHISEI_REPOSITORY,
  catalog: `${SHISEI_REPOSITORY}/blob/${SHISEI_REVISION}/data/costumes.json`,
  license: `${SHISEI_REPOSITORY}/blob/${SHISEI_REVISION}/LICENSE-images`,
}

export const COSTUME_SOURCES = [
  { id: 'gia', label: 'ギア · 写实', url: 'https://ai-costume-gallery.pages.dev/', notice: 'ギア（@giaaibusi）AI 服装参考。' },
  { id: 'gia-anime', label: 'ギア · 动漫', url: 'https://ai-costume-anime-gallery.pages.dev/', notice: '仅收录元数据，图片由ギア原站提供；使用请遵守原站说明。' },
  { id: 'charadb', label: 'たき AI · CharaDB', url: 'https://github.com/taki-ttt/charadb/blob/main/LICENSE', notice: '仅供参考，须遵守原作者限制；请阅读来源条款。' },
  { id: 'shisei', label: 'Shisei · 中国历代', url: 'https://github.com/wquguru/shisei', notice: 'wquguru 的 AI 生成服装参考，CC0；标注来源。并非专业历史服饰复原。' },
] as const

export function costumeSourceId(item: CostumeItem): string {
  return item.source || 'gia'
}

export function selectCostumeView(item: CostumeItem, id = item.selectedView || 'front'): CostumeItem {
  const view = item.views?.find((view) => view.id === id) || item.views?.find((view) => view.id === 'front') || item.views?.[0]
  return view ? { ...item, selectedView: view.id, 缩略图: view.缩略图, 预览图: view.预览图, 原图: view.原图 } : item
}
