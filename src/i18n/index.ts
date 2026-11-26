// 界面语言固定为越南文；中文原文仅作为翻译字典的 key 与回退文案，不对用户暴露。
// - 中文文案直接写在源码中，同时作为翻译字典的 key。
// - 越南文界面文案在 src/i18n/locales/vi.ts，数据标签在 data/i18n/vi/*.json（按原有 id 索引）。
// - 发给图像模型的提示词始终使用原始数据，不受界面语言影响。
import { updateMetadata } from './metadata'
import vi from './locales/vi'
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { CostumeItem, GenerationHistoryItem, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'

export const LANGS = ['vi'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'vi'
export const LANG_STORAGE_KEY = 'ai-pose-gallery-lang'
export const LANG_LABELS: Record<Lang, string> = { vi: 'Tiếng Việt' }
const HTML_LANG: Record<Lang, string> = { vi: 'vi' }

type Dict = Record<string, string>
export interface DataLabels {
  /** 姿势名称，key 为去掉角度后缀的姿势 id（如 full_sexy_P001） */
  poses: Dict
  /** 服装名称，key 为服装 id */
  costumes: Dict
  /** 分类、体系、角度、标签、发长、发型等词条，key 为原中文词条 */
  terms: Dict
}

interface State {
  lang: Lang
  ui: Dict
  data: DataLabels
}

const EMPTY: DataLabels = { poses: {}, costumes: {}, terms: {} }
// 越南文界面文案静态导入并预填：首帧即为越南文，无中文闪烁。
let state: State = { lang: DEFAULT_LANG, ui: vi as Dict, data: EMPTY }
const listeners = new Set<() => void>()

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/** 语言固定为越南文，浏览器语言不再影响界面。 */
export function detectLang(_languages?: readonly string[]): Lang {
  return DEFAULT_LANG
}

async function loadJson(url: string): Promise<Dict> {
  try {
    const res = await fetch(url)
    return res.ok ? ((await res.json()) as Dict) : {}
  } catch {
    return {}
  }
}

async function loadResources(): Promise<Pick<State, 'ui' | 'data'>> {
  const [poses, costumes, terms] = await Promise.all([
    loadJson('/data/i18n/vi/poses.json'),
    loadJson('/data/i18n/vi/costumes.json'),
    loadJson('/data/i18n/vi/terms.json'),
  ])
  return { ui: vi as Dict, data: { poses, costumes, terms } }
}

function apply(lang: Lang, res: Pick<State, 'ui' | 'data'>) {
  state = { lang, ...res }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = HTML_LANG[lang]
    updateMetadata()
  }
  listeners.forEach((fn) => fn())
}

/** 启动时调用：忽略历史遗留的其他语言设置并改写为越南文，加载越南文数据标签。 */
export async function initI18n(): Promise<void> {
  try {
    if (localStorage.getItem(LANG_STORAGE_KEY) !== DEFAULT_LANG) localStorage.setItem(LANG_STORAGE_KEY, DEFAULT_LANG)
  } catch {
    // 隐私模式等无法写入时忽略
  }
  apply(DEFAULT_LANG, await loadResources())
}

export function getLang(): Lang {
  return state.lang
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 订阅当前语言；根布局以语言为 key 重新渲染整个界面。 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang)
}

/**
 * 翻译界面文案：以中文原文为 key，`{name}` 为插值占位符。
 * 越南文没有对应译文时回退为中文。
 */
export function t(zh: string, vars?: Record<string, string | number>): string {
  let s = state.ui[zh] ?? zh
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

/** 数据词条（分类、体系、角度、标签、发长、发型等）。 */
export function term(zh: string): string {
  return (zh && state.data.terms[zh]) || zh
}

export function poseKey(id: string): string {
  return id.replace(/_(front|high|low|side|diag)$/, '')
}

export function poseName(item: PoseItem | PoseGroup): string {
  if ('items' in item) return item.items[0] ? poseName(item.items[0]) : item.name
  return item.source === 'upload' ? item.姿势名称 : state.data.poses[poseKey(item.id)] || item.姿势名称
}

export function costumeName(item: CostumeItem): string {
  return item.source === 'upload' ? item.服装名称 : state.data.costumes[item.id] || item.服装名称
}

export function portraitStyle(item: PortraitItem): string {
  return item.source === 'upload' ? item.发型名称 : term(item.发型名称)
}

/** 生成记录标题：按快照中的素材 id 取当前语言名称；没有快照的旧记录回退为保存的中文摘要（存储格式不变）。 */
export function historySummary(item: Pick<GenerationHistoryItem, 'recipeSummary' | 'snapshot'>): string {
  const r = item.snapshot?.recipe
  const names = r ? [r.portrait && portraitStyle(r.portrait), r.costume && costumeName(r.costume), r.pose && poseName(r.pose)].filter(Boolean) : []
  return names.join(' + ') || (r || item.recipeSummary === '自定义合成' ? t('自定义合成') : item.recipeSummary)
}

export function portraitTitle(item: PortraitItem): string {
  return item.source === 'upload' ? item.标题 : term(item.标题)
}

/** 当前语言下附加的检索文本（中文检索字段仍然保留）。 */
export function localSearchText(parts: string[]): string {
  return parts.map(term).join(' ')
}

/** 数字格式（越南文 zh→vi 点号千分位）。 */
export function formatNumber(n: number): string {
  return n.toLocaleString(HTML_LANG[state.lang])
}

/** 当前界面语言的时间格式。 */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(HTML_LANG[state.lang])
}

/** 带 React 节点插值的翻译：`tn('见 {link}', { link: <a … /> })`，整句一起翻译，避免拆碎。 */
export function tn(zh: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return t(zh)
    .split(/(\{\w+\})/)
    .map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      return createElement(Fragment, { key: i }, m && m[1] in nodes ? nodes[m[1]] : part)
    })
}
