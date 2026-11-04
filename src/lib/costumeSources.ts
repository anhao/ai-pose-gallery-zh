import type { CostumeItem } from '@/types/gallery'

export const COSTUME_SOURCES = [
  { id: 'gia', label: 'ギア · 写实', url: 'https://ai-costume-gallery.pages.dev/', notice: 'ギア（@giaaibusi）AI 服装参考。' },
  { id: 'gia-anime', label: 'ギア · 动漫', url: 'https://ai-costume-anime-gallery.pages.dev/', notice: '仅收录元数据，图片由ギア原站提供；使用请遵守原站说明。' },
  { id: 'charadb', label: 'たき AI · CharaDB', url: 'https://github.com/taki-ttt/charadb/blob/main/LICENSE', notice: '仅供参考，须遵守原作者限制；请阅读来源条款。' },
] as const

export function costumeSourceId(item: CostumeItem): string {
  return item.source || 'gia'
}
