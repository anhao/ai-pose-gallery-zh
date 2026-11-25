// 界面多语言（中文为默认语言，英文 / 泰文为可选附加语言）。
// - 中文文案直接写在源码中，同时作为翻译字典的 key；未翻译的文案自动回退为中文。
// - 英文 / 泰文的界面文案在 src/i18n/locales/*.ts，数据标签在 data/i18n/<lang>/*.json（按原有 id 索引）。
// - 发给图像模型的提示词始终使用原始数据，不受界面语言影响。
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { CostumeItem, PortraitItem, PoseGroup, PoseItem } from '@/types/gallery'

export const LANGS = ['zh', 'en', 'th'] as const
export type Lang = (typeof LANGS)[number]
export const DEFAULT_LANG: Lang = 'zh'
export const LANG_STORAGE_KEY = 'ai-pose-gallery-lang'
export const LANG_LABELS: Record<Lang, string> = { zh: '中文', en: 'English', th: 'ไทย' }
const HTML_LANG: Record<Lang, string> = { zh: 'zh-CN', en: 'en', th: 'th' }

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
let state: State = { lang: DEFAULT_LANG, ui: {}, data: EMPTY }
const listeners = new Set<() => void>()

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value)
}

/** 首次访问按浏览器语言选择：th* → 泰文，en* → 英文，其余（含 zh*）→ 中文。 */
export function detectLang(languages: readonly string[]): Lang {
  const first = (languages[0] || '').toLowerCase()
  if (first.startsWith('th')) return 'th'
  if (first.startsWith('en')) return 'en'
  return 'zh'
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY)
    return isLang(v) ? v : null
  } catch {
    return null
  }
}

async function loadJson(url: string): Promise<Dict> {
  try {
    const res = await fetch(url)
    return res.ok ? ((await res.json()) as Dict) : {}
  } catch {
    return {}
  }
}

async function loadResources(lang: Lang): Promise<Pick<State, 'ui' | 'data'>> {
  if (lang === 'zh') return { ui: {}, data: EMPTY }
  const [ui, poses, costumes, terms] = await Promise.all([
    (lang === 'en' ? import('./locales/en') : import('./locales/th')).then((m) => m.default as Dict),
    loadJson(`/data/i18n/${lang}/poses.json`),
    loadJson(`/data/i18n/${lang}/costumes.json`),
    loadJson(`/data/i18n/${lang}/terms.json`),
  ])
  return { ui, data: { poses, costumes, terms } }
}

function apply(lang: Lang, res: Pick<State, 'ui' | 'data'>) {
  state = { lang, ...res }
  if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[lang]
  listeners.forEach((fn) => fn())
}

/** 启动时调用：读取已保存的语言，否则按浏览器语言选择；中文无需加载任何资源。 */
export async function initI18n(): Promise<void> {
  const lang = storedLang() ?? detectLang(typeof navigator === 'undefined' ? [] : navigator.languages || [navigator.language])
  if (lang !== 'zh') apply(lang, await loadResources(lang))
}

/** 用户手动切换语言（记住到 localStorage）。 */
export async function setLang(lang: Lang): Promise<void> {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // 隐私模式等无法写入时忽略
  }
  if (lang === state.lang) return
  apply(lang, await loadResources(lang))
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
 * 当前语言没有对应译文时回退为中文。
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
  return state.data.poses[poseKey(item.id)] || item.姿势名称
}

export function costumeName(item: CostumeItem): string {
  return state.data.costumes[item.id] || item.服装名称
}

export function portraitStyle(item: PortraitItem): string {
  return term(item.发型名称)
}

export function portraitTitle(item: PortraitItem): string {
  return term(item.标题)
}

/** 当前语言下附加的检索文本（中文检索字段仍然保留）。 */
export function localSearchText(parts: string[]): string {
  return state.lang === 'zh' ? '' : parts.map(term).join(' ')
}

/** 数字格式（中文保持原有 zh-CN 格式）。 */
export function formatNumber(n: number): string {
  return n.toLocaleString(state.lang === 'zh' ? 'zh-CN' : state.lang)
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
