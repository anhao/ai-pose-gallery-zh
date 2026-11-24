import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { detectLang, poseKey, t } from '../src/i18n'
import en from '../src/i18n/locales/en'
import th from '../src/i18n/locales/th'

const root = join(import.meta.dirname, '..')
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const LOCALES = { en, th }
const LANGS = ['en', 'th'] as const

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

function uiKeys(): Set<string> {
  const keys = new Set<string>()
  for (const file of sourceFiles(join(root, 'src'))) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\btn?\('((?:[^'\\\n]|\\.)*)'/g)) {
      keys.add(m[1].replace(/\\(.)/g, '$1'))
    }
  }
  return keys
}

test('first visit picks the language from the browser, Chinese otherwise', () => {
  assert.equal(detectLang(['th-TH', 'en-US']), 'th')
  assert.equal(detectLang(['en-GB']), 'en')
  assert.equal(detectLang(['zh-CN', 'en']), 'zh')
  assert.equal(detectLang(['ja-JP', 'th']), 'zh')
  assert.equal(detectLang([]), 'zh')
})

test('Chinese stays the default: t() returns the source text with placeholders filled', () => {
  assert.equal(t('重置'), '重置')
  assert.equal(t('加载更多（剩余 {n} 套）', { n: 3 }), '加载更多（剩余 3 套）')
})

test('every UI string has an English and a Thai translation with the same placeholders', () => {
  const keys = uiKeys()
  assert.ok(keys.size > 300, `found only ${keys.size} t() keys`)
  for (const lang of LANGS) {
    const dict = LOCALES[lang]
    const missing = [...keys].filter((k) => !dict[k])
    assert.deepEqual(missing, [], `${lang}: missing ${missing.length} UI strings`)
    for (const [zh, value] of Object.entries(dict)) {
      const want = (zh.match(/\{\w+\}/g) || []).sort()
      const got = (value.match(/\{\w+\}/g) || []).sort()
      assert.deepEqual(got, want, `${lang}: placeholders differ for ${zh}`)
    }
  }
})

test('data labels cover every pose, costume and term, keyed by the existing ids', () => {
  const poses = readJson<{ id: string; 体系: string; 分类: string; 角度: string }[]>('data/pose-zh.json')
  const costumes = ['costume-zh', 'costume-anime-zh', 'costume-gia-anime-zh', 'costume-shisei-zh'].flatMap((f) =>
    readJson<{ id: string; 分类: string; 标签: string[]; 一级分类?: string; views?: { label: string }[] }[]>(`data/${f}.json`)
  )
  const portraits = readJson<{ 分区: string; 发长: string; 发型名称: string; 标题: string }[]>('data/portrait-zh.json')
  const terms = new Set<string>([
    ...poses.flatMap((p) => [p.体系, p.分类, p.角度]),
    ...costumes.flatMap((c) => [c.分类, ...c.标签, ...(c.views || []).map((v) => v.label), ...(c.一级分类 ? [c.一级分类] : [])]),
    ...portraits.flatMap((p) => [p.分区, p.发长, p.发型名称, p.标题]),
  ])
  const poseKeys = new Set(poses.map((p) => poseKey(p.id)))
  const costumeIds = new Set(costumes.map((c) => c.id))
  for (const lang of LANGS) {
    const labels = {
      poses: readJson<Record<string, string>>(`data/i18n/${lang}/poses.json`),
      costumes: readJson<Record<string, string>>(`data/i18n/${lang}/costumes.json`),
      terms: readJson<Record<string, string>>(`data/i18n/${lang}/terms.json`),
    }
    assert.deepEqual([...poseKeys].filter((k) => !labels.poses[k]), [], `${lang}: poses without label`)
    assert.deepEqual(Object.keys(labels.poses).filter((k) => !poseKeys.has(k)), [], `${lang}: stale pose keys`)
    assert.deepEqual([...costumeIds].filter((k) => !labels.costumes[k]), [], `${lang}: costumes without label`)
    assert.deepEqual(Object.keys(labels.costumes).filter((k) => !costumeIds.has(k)), [], `${lang}: stale costume ids`)
    assert.deepEqual([...terms].filter((k) => !labels.terms[k]), [], `${lang}: terms without label`)
  }
})
