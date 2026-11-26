import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient } from '@tanstack/react-query'
import { DEFAULT_LANG, detectLang, formatNumber, formatTime, historySummary, initI18n, LANG_STORAGE_KEY, portraitStyle, portraitTitle, poseKey, t, term } from '../src/i18n'
import { METADATA } from '../src/i18n/metadata'
import { proxyErrorMessage } from '../src/lib/proxyError'
import { durableImage } from '../src/lib/persistentImages'
import { uploadedReferences } from '../src/lib/recipeImages'
import { getWorkflowControls, getWorkflowImages, workflowIdentity } from '../src/lib/comfyWorkflowParameters'
import { costumesQuery, portraitsQuery, posesQuery } from '../src/api/gallery'
import { COMFYUI_WORKFLOW_TEMPLATES, PROVIDER_META, STYLE_PRESETS, buildRecipePrompt, parseComfyWorkflowNodes, workflowPresentation } from '../src/services/aiGenerator'
import { COSTUME_SOURCES } from '../src/lib/costumeSources'
import { navGroups } from '../src/components/layout/nav'
import { COMFY_CONNECTION_LABELS } from '../src/store/useComfyConnection'
import { Breadcrumb } from '../src/components/ui/breadcrumb'
import { Dialog, DialogFooter } from '../src/components/ui/dialog'
import { SidebarProvider, SidebarTrigger } from '../src/components/ui/sidebar'
import { PIXAI_MODEL, PixAiUnknownError, resumePixAiTask } from '../src/services/pixai'
import vi from '../src/i18n/locales/vi'

const root = join(import.meta.dirname, '..')
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T
const LOCALES = { vi }
const LANGS = ['vi'] as const

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

test('the language is fixed to Vietnamese and any stored zh/en/th value is ignored and rewritten', async () => {
  assert.equal(DEFAULT_LANG, 'vi')
  assert.equal(detectLang(['th-TH', 'en-US']), 'vi')
  assert.equal(detectLang(['en-GB']), 'vi')
  assert.equal(detectLang(['zh-CN', 'en']), 'vi')
  assert.equal(detectLang(['ja-JP']), 'vi')
  assert.equal(detectLang([]), 'vi')
  const realFetch = globalThis.fetch
  const storage = new Map<string, string>([[LANG_STORAGE_KEY, 'zh']])
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
  }
  try {
    globalThis.fetch = (async () => new Response('{}')) as typeof fetch
    await initI18n()
    assert.equal(storage.get(LANG_STORAGE_KEY), 'vi')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('first paint is already Vietnamese (UI dict is statically loaded), with the Chinese key as fallback and placeholders filled', () => {
  assert.equal(t('重置'), 'Đặt lại')
  assert.equal(t('加载更多（剩余 {n} 套）', { n: 3 }), 'Tải thêm (còn 3 bộ)')
  assert.equal(t('未翻译的中文句子'), '未翻译的中文句子')
})

test('every UI string has a Vietnamese translation with the same placeholders', () => {
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

test('service messages go through t(), so the coverage test above enforces their translations', () => {
  for (const file of ['src/services/pixai.ts', 'src/services/aiGenerator.ts']) {
    const bare = readFileSync(join(root, file), 'utf8').split('\n')
      .filter((line) => /(new \w*Error\(|\bmessage: |\bsuper\()\s*['`][^'`]*[一-鿿]/.test(line))
    assert.deepEqual(bare, [], `${file}: Chinese message not wrapped in t()`)
  }
})

test('under vi, service errors and history titles are Vietnamese; the stored Chinese summary is untouched', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string) => new Response(readFileSync(join(root, url)))) as typeof fetch
  try {
    const portrait = readJson<{ 发型名称: string }[]>('data/portrait-zh.json')[0]
    const costume = readJson<{ id: string; 服装名称: string }[]>('data/costume-zh.json')[0]
    const pose = readJson<{ id: string; 姿势名称: string }[]>('data/pose-zh.json')[0]
    const zh = [portrait.发型名称, costume.服装名称, pose.姿势名称].join(' + ')
    const item = { recipeSummary: zh, snapshot: { recipe: { portrait, costume, pose } } } as unknown as Parameters<typeof historySummary>[0]
    const warning = '[PixAI] 提交结果未知：可能已创建任务并扣除额度。请在 PixAI 核对任务，勿重复提交。'
    assert.equal(new PixAiUnknownError().message, vi[warning])

    await initI18n()
    assert.equal(new PixAiUnknownError().message, vi[warning])
    assert.match(vi[warning], /credit/)
    assert.equal(t('[PixAI] {label}读取失败：{reason}', { label: t('服装'), reason: 'x' }), '[PixAI] Không đọc được ảnh Trang phục: x')
    const terms = readJson<Record<string, string>>('data/i18n/vi/terms.json')
    const costumes = readJson<Record<string, string>>('data/i18n/vi/costumes.json')
    const poses = readJson<Record<string, string>>('data/i18n/vi/poses.json')
    assert.equal(historySummary(item), [terms[portrait.发型名称], costumes[costume.id], poses[poseKey(pose.id)]].join(' + '))
    assert.equal(item.recipeSummary, zh)
    // 没有快照的旧记录：只有固定摘要可翻译，其余保持保存的原文
    assert.equal(historySummary({ recipeSummary: '自定义合成' }), vi['自定义合成'])
    assert.equal(historySummary({ recipeSummary: '旧记录' }), '旧记录')
    assert.equal(historySummary({ recipeSummary: '服装' }), '服装')
  } finally {
    globalThis.fetch = realFetch
  }
})

test('workflow presentation tolerates malformed imported nodes without translating user titles', async () => {
  const workflow = JSON.parse('{"1":{"class_type":"LoadImage","inputs":{"image":"x.png"}},"extra":null}')
  const json = JSON.stringify(workflow)
  assert.equal(parseComfyWorkflowNodes(json).valid, true)
  await initI18n()
  for (const extra of [null, false, 42, 'metadata', [], {}]) {
    assert.equal(workflowPresentation({ ...workflow, extra })('人像'), '人像')
  }
  assert.equal(JSON.stringify(workflow), json)
})

test('new reference defaults stay canonical across languages, including prompt payloads', async () => {
  const studio = readFileSync(join(root, 'src/routes/studio.tsx'), 'utf8')
  const store = readFileSync(join(root, 'src/store/studioStore.tsx'), 'utf8')
  // Exercise the actual creation expressions without mounting the browser-only studio.
  const expressions = [
    studio.match(/const name = (.+)\n/)![1],
    studio.match(/addExtraImage\(\{ name: (baseName[^\n]+), url: dataUrl/)![1],
    studio.match(/addExtraImage\(\{ name: (.+), url: trimmed/)![1],
    store.match(/name: (item\.name[^\n]+),/)![1],
  ]
  const createNames = (custom: string) => expressions.map((expression) =>
    new Function('t', 'file', 'baseName', 'item', `return ${expression}`)(t, { name: custom }, custom, { name: custom }) as string)
  const expected = ['上传图片', '附加图', '外部参考图', '附加参考']
  const prompts: string[][] = []
  for (const lang of LANGS as readonly string[]) {
    const names = createNames('')
    assert.deepEqual(names, expected, lang)
    assert.deepEqual(createNames('user reference'), ['user reference', 'user reference', '外部参考图', 'user reference'])
    const uploaded = uploadedReferences(names[0], 'data:image/png;base64,AA==', 1, 1, 1)
    const recipe = { ...uploaded, extraImages: names.slice(1).map((name, i) => ({ id: `${lang}-${i}`, name, url: 'https://example.test/ref.png' })) }
    prompts.push(Object.keys(STYLE_PRESETS).map((style) => buildRecipePrompt(recipe, style)))
    assert.equal(recipe.portrait.发型名称, '上传图片')
    assert.equal(recipe.costume.服装名称, '上传图片')
    assert.equal(recipe.pose.姿势名称, '上传图片')
  }
  for (const prompt of prompts) assert.deepEqual(prompt, prompts[0])
})

test('comparison slider aria-valuetext is Vietnamese and always shows the percentage', async () => {
  const source = readFileSync(join(root, 'src/components/common/ReferenceComparisonDialog.tsx'), 'utf8')
  const expression = source.match(/aria-valuetext=\{(.+?)\} onChange/)![1]
  const valueText = new Function('t', 'split', `return ${expression}`)
  for (const [expected] of [['37% ảnh tham khảo']] as const) {
    assert.equal(valueText(t, 37), expected)
    for (const split of [0, 100]) assert.ok(valueText(t, split).includes(`${split}%`))
  }
})

test('dynamic presentation registries and bundled workflow titles have complete locale coverage', () => {
  const strings = [
    ...Object.values(METADATA),
    ...Object.values(PROVIDER_META).flatMap((p) => [p.name, p.shortName, ...p.models.map((m) => m.label)]),
    ...Object.values(STYLE_PRESETS).map((s) => s.label),
    ...Object.values(COMFYUI_WORKFLOW_TEMPLATES).flatMap((w) => [w.label, ...Object.values(w.workflow).map((n) => n._meta?.title || n.class_type)]),
    ...COSTUME_SOURCES.flatMap((s) => [s.label, s.notice]),
    ...navGroups.flatMap((g) => [g.label, ...g.items.map((i) => i.title)]),
    ...Object.values(COMFY_CONNECTION_LABELS),
  ].filter((s) => /[一-鿿]/.test(s))
  for (const [lang, dict] of Object.entries(LOCALES)) {
    assert.deepEqual(strings.filter((s) => !dict[s]), [], `${lang}: untranslated registry labels`)
  }
})

test('Vietnamese semantic fixes retain optional wording and distinguish categories', () => {
  const terms = readJson<Record<string, string>>('data/i18n/vi/terms.json')
  const costumes = readJson<Record<string, string>>('data/i18n/vi/costumes.json')
  assert.equal(costumes['charadb-O005'], 'Áo blazer xám phối cà vạt')
  assert.equal(terms['婚服'], 'Trang phục cưới')
  assert.equal(terms['趴卧'], 'Nằm sấp')
  assert.notEqual(terms['坐位'], terms['坐姿'])
  assert.notEqual(terms['立位'], terms['站姿'])
  const privacyKey = 'AI 生图请求发送至使用者配置的服务（云端 API 或本机 ComfyUI）；若启用本站代理，代理会转发 API Key 与请求数据（包括上传的图片）。请仅使用可信的部署与服务，并在上传前确认已获得必要授权与同意。'
  assert.deepEqual([uiKeys().has(privacyKey), vi[privacyKey]], [true, 'Yêu cầu tạo ảnh AI được gửi đến dịch vụ do người dùng cấu hình (API đám mây hoặc ComfyUI cục bộ). Nếu bật proxy của trang web, proxy sẽ chuyển tiếp API Key và dữ liệu yêu cầu (bao gồm ảnh tải lên). Chỉ sử dụng các bản triển khai và dịch vụ đáng tin cậy, đồng thời xác nhận đã có sự cho phép và đồng ý cần thiết trước khi tải lên.'])
  assert.equal(vi['同类'], 'Cùng danh mục')
  assert.equal(vi['auto (组图)'], 'auto (bộ ảnh)')
  assert.match(vi[' 可选择完整角色设定集，人物身份与外观以此图为准。'], /^ Bạn có thể/)
  assert.match(vi['放弃本地恢复记录？这不会取消服务器任务，重新生成可能再次扣除额度。'], /credit/)
  assert.match(vi[' · 深度图'], /^ · /)
  const portraits = readJson<{ 发型名称: string; 标题: string }[]>('data/portrait-zh.json')
  const searchable = portraits.map((p) => [terms[p.发型名称], terms[p.标题]].join(' ').toLowerCase())
  for (const example of ['bob', 'wolf cut', 'mái thưa', 'highlight', 'kiểu Hàn']) {
    assert.ok(searchable.some((s) => s.includes(example.toLowerCase())), `unsearchable guidance: ${example}`)
  }
})

test('vi localizes UI, metadata, owned failures and workflow presentation without rewriting payloads or user content', async () => {
  const realFetch = globalThis.fetch
  const realDocument = globalThis.document
  const html = readFileSync(join(root, 'index.html'), 'utf8')
  const schema = { textContent: html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1] }
  const meta = new Map<string, string>()
  globalThis.document = {
    title: '', documentElement: { lang: 'vi' },
    querySelector: (selector: string) => selector.startsWith('script') ? schema : { setAttribute: (_key: string, value: string) => meta.set(selector, value) },
  } as unknown as Document
  globalThis.fetch = (async (url: string) => new Response(readFileSync(join(root, url)))) as typeof fetch
  const workflow = structuredClone(COMFYUI_WORKFLOW_TEMPLATES.qwen2509_3img.workflow)
  const json = JSON.stringify(workflow)
  const identity = workflowIdentity(json)
  const recipe = { portrait: null, costume: null, pose: null, extraImages: [{ id: 'user', name: '人像', url: 'https://example.test/ref.png' }] }
  const prompts = Object.keys(STYLE_PRESETS).map((style) => buildRecipePrompt(recipe, style))
  try {
    await initI18n()
    assert.equal(document.documentElement.lang, 'vi')
    assert.equal(document.title, vi[METADATA.title])
    assert.equal(meta.get('meta[name="description"]'), vi[METADATA.description])
    assert.equal(meta.get('meta[property="og:locale"]'), 'vi_VN')
    const website = JSON.parse(schema.textContent)['@graph'][0]
    assert.equal(website.inLanguage, 'vi')
    assert.equal(website.description, vi[METADATA.schemaDescription])
    assert.equal(website.url, 'https://ai-pose-gallery.anhao.app/')
    assert.equal(formatNumber(1439), (1439).toLocaleString('vi'))
    assert.equal(formatTime(0), new Date(0).toLocaleTimeString('vi'))
    assert.match(renderToStaticMarkup(createElement(Breadcrumb)), /Điều hướng phân cấp/)
    assert.match(renderToStaticMarkup(createElement(Dialog, null, createElement(DialogFooter, { showCloseButton: true }))), /Đóng/)
    assert.match(renderToStaticMarkup(createElement(SidebarProvider, null, createElement(SidebarTrigger))), /Ẩn\/hiện thanh bên/)

    for (const raw of ['Missing x-target-url header', 'Invalid x-target-url header', 'Method Not Allowed', 'Target origin not allowed', 'Upstream redirect blocked', 'Upstream proxy error', 'Proxy request failed', 'Request body exceeds 123 bytes']) {
      const translated = proxyErrorMessage(raw)
      assert.notEqual(translated, raw)
      assert.equal(proxyErrorMessage(JSON.stringify({ error: { message: raw } })), translated)
    }
    for (const raw of ['upstream diagnostic: 用户输入', '__proto__', '{bad json', 'Request body exceeds NaN bytes', JSON.stringify({ error: { message: 'external diagnostic' } })]) assert.equal(proxyErrorMessage(raw), raw)
    assert.match(proxyErrorMessage('Request body exceeds 123 bytes'), /123/)

    const display = workflowPresentation(workflow)
    for (const node of Object.values(workflow)) {
      const title = node._meta?.title || node.class_type
      assert.equal(display(title), vi[title] || title)
    }
    assert.equal(JSON.stringify(workflow), json)
    assert.equal(workflowIdentity(json), identity)
    assert.equal(parseComfyWorkflowNodes(json).imageNodes[0].title, workflow['1']._meta!.title)
    assert.deepEqual(Object.keys(STYLE_PRESETS).map((style) => buildRecipePrompt(recipe, style)), prompts)
    assert.equal(recipe.extraImages[0].name, '人像')
    const user = uploadedReferences('趴卧', 'data:image/png;base64,AA==', 1, 1, 1)
    assert.equal(portraitStyle(user.portrait), '趴卧')
    assert.equal(portraitTitle(user.portrait), '趴卧')
    assert.equal(term('趴卧'), 'Nằm sấp')

    const imported = { '1': { class_type: 'Custom', inputs: { choice: 'raw_enum' }, _meta: { title: '人像', studio: { controls: [{ input: 'choice', label: '服装', group: '姿势', description: '人像', options: [{ value: 'raw_enum', label: '同类' }] }] } } } }
    const customJson = JSON.stringify(imported)
    const control = getWorkflowControls(customJson, { Custom: { input: { required: { choice: [['raw_enum']] } } } })[0]
    const customDisplay = workflowPresentation(imported)
    assert.equal(customDisplay(control.label), '服装')
    assert.equal(customDisplay(control.group!), '姿势')
    assert.equal(customDisplay(control.description!), '人像')
    assert.equal(customDisplay(control.optionLabels![JSON.stringify('raw_enum')]), '同类')
    assert.deepEqual(control.options, ['raw_enum'])
    assert.equal(JSON.stringify(imported), customJson)
    workflow['1']._meta!.title = '人像'
    assert.equal(workflowPresentation(workflow)('人像'), '人像')
    assert.equal(getWorkflowImages(JSON.stringify({ '9': { class_type: 'LoadImage', inputs: { image: 'x.png' } } }), [])[0].label, 'Ảnh tham khảo · 9')

    globalThis.fetch = async () => new Response('', { status: 503 })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    for (const [query, key] of [[posesQuery, '加载姿势数据失败: HTTP {status}'], [costumesQuery, '加载服装数据失败: HTTP {status}'], [portraitsQuery, '加载人像数据失败: HTTP {status}']] as const) {
      await assert.rejects(client.fetchQuery(query as typeof posesQuery), { message: t(key, { status: 503 }) })
    }
    await assert.rejects(durableImage('/broken.png'), { message: vi['图片下载失败'] })
    globalThis.fetch = async () => new Response('not an image')
    await assert.rejects(durableImage('/broken.png'), { message: vi['引用不是图片'] })
    globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'Missing x-target-url header' } }), { status: 400 })
    await assert.rejects(resumePixAiTask({ task: { provider: 'pixai', taskId: 'keep-id', model: PIXAI_MODEL, baseUrl: 'https://api.pixai.art', submittedAt: 1, useProxy: true }, apiKey: 'test' }), (error: Error) => {
      assert.ok(error.message.includes(vi['代理请求缺少 x-target-url 请求头']))
      assert.match(error.message, /400/)
      return true
    })
    for (const status of ['failed', 'cancelled']) {
      globalThis.fetch = async () => new Response(JSON.stringify({ status, error: { message: 'external detail 原文' } }))
      await assert.rejects(resumePixAiTask({ task: { provider: 'pixai', taskId: 'keep-id', model: PIXAI_MODEL, baseUrl: 'https://api.pixai.art', submittedAt: 1, useProxy: true }, apiKey: 'test' }), (error: Error) => {
        assert.match(error.message, /keep-id/)
        assert.ok(error.message.includes(status === 'failed' ? vi['失败'] : vi['已取消']))
        assert.ok(error.message.includes('external detail 原文'))
        return true
      })
    }
  } finally {
    globalThis.fetch = realFetch
    globalThis.document = realDocument
  }
})
