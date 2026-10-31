import { queryOptions } from '@tanstack/react-query'
import type { CostumeItem, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'

export const ANGLES = ['正面', '俯视', '仰视', '侧面', '斜侧'] as const

export const PREFERRED_POSE_LINE_ORDER = [
  '全身单人・标准系',
  '上半身单人',
  '全身单人・性感系',
  '双人缠绵',
] as const

export const NSFW_POSE_SYSTEMS = new Set(['全身单人・性感系', '双人缠绵'])
export const NSFW_COSTUME_CATEGORIES = new Set(['内衣・睡衣', '性感穿搭'])

export function isNsfwPoseSystem(system: string): boolean {
  return NSFW_POSE_SYSTEMS.has(system)
}

export function isNsfwPose(item: PoseItem | PoseGroup): boolean {
  const sys = '体系' in item ? item.体系 : item.system
  return NSFW_POSE_SYSTEMS.has(sys)
}

export function isNsfwCostumeCategory(category: string): boolean {
  return NSFW_COSTUME_CATEGORIES.has(category)
}

export function isNsfwCostume(item: CostumeItem): boolean {
  return NSFW_COSTUME_CATEGORIES.has(item.分类)
}

export function buildPoseGroups(items: PoseItem[]): { items: PoseItem[]; groups: PoseGroup[]; lines: string[] } {
  const rawLines = [...new Set(items.map((x) => x.体系))]
  const lines = rawLines.sort((a, b) => {
    const ia = PREFERRED_POSE_LINE_ORDER.indexOf(a as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    const ib = PREFERRED_POSE_LINE_ORDER.indexOf(b as (typeof PREFERRED_POSE_LINE_ORDER)[number])
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })
  const groupMap = new Map<string, PoseGroup>()
  const groups: PoseGroup[] = []

  for (const item of items) {
    const key = `${item.体系}|${item.姿势编号 || item.id}`
    let group = groupMap.get(key)
    if (!group) {
      group = {
        key,
        system: item.体系,
        number: item.姿势编号,
        name: item.姿势名称,
        category: item.分类,
        items: [],
        angles: {},
        order: [],
      }
      groupMap.set(key, group)
      groups.push(group)
    }
    group.items.push(item)
    if (item.角度 && !group.angles[item.角度]) {
      group.angles[item.角度] = item
    }
  }

  groups.sort((a, b) => lines.indexOf(a.system) - lines.indexOf(b.system) || String(a.number).localeCompare(String(b.number)))
  for (const group of groups) {
    group.order = ANGLES.map((a) => group.angles[a]).filter(Boolean)
    for (const item of group.items) {
      if (!group.order.includes(item)) group.order.push(item)
    }
  }

  return { items, groups, lines }
}

export const posesQuery = queryOptions({
  queryKey: ['gallery', 'poses'],
  staleTime: Infinity,
  queryFn: async () => {
    const res = await fetch('/data/pose-zh.json')
    if (!res.ok) throw new Error(`加载姿势数据失败: HTTP ${res.status}`)
    const data = (await res.json()) as PoseItem[]
    return buildPoseGroups(data)
  },
})

export const costumesQuery = queryOptions({
  queryKey: ['gallery', 'costumes'],
  staleTime: Infinity,
  queryFn: async () => {
    const res = await fetch('/data/costume-zh.json')
    if (!res.ok) throw new Error(`加载服装数据失败: HTTP ${res.status}`)
    return (await res.json()) as CostumeItem[]
  },
})

export const portraitsQuery = queryOptions({
  queryKey: ['gallery', 'portraits'],
  staleTime: Infinity,
  queryFn: async () => {
    const res = await fetch('/data/portrait-zh.json')
    if (!res.ok) throw new Error(`加载人像数据失败: HTTP ${res.status}`)
    return (await res.json()) as PortraitItem[]
  },
})
