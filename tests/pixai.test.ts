import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_PIXAI_PARAMS, PIXAI_MODEL, generateWithPixAi, pixAiBaseUrl, pixAiPayload, pixAiSources, preparePixAiImage, resumePixAiTask, PixAiUnknownError, PixAiTerminalError } from '../src/services/pixai'
import { handleProxy } from '../functions/api/proxy'
import worker from '../worker'
import type { ApiConfig, RecipeState } from '../src/types/gallery'

const nativeFetch = globalThis.fetch
const nativeBitmap = globalThis.createImageBitmap
const nativeReader = globalThis.FileReader
afterEach(() => { globalThis.fetch = nativeFetch; globalThis.createImageBitmap = nativeBitmap; globalThis.FileReader = nativeReader })
const recipe = { portrait: { 原图: 'data:image/png;base64,AA==' }, costume: { 预览图: 'data:image/png;base64,AQ==', 原图: 'other-view' }, pose: { 原图: 'data:image/png;base64,Ag==' } } as RecipeState
const config = { providers: { pixai: { baseUrl: 'https://api.pixai.art', apiKey: 'test-secret', model: PIXAI_MODEL } }, pixaiParams: DEFAULT_PIXAI_PARAMS, useProxy: true } as ApiConfig
const task = { provider: 'pixai' as const, taskId: 'task-1', model: PIXAI_MODEL, baseUrl: 'https://api.pixai.art', submittedAt: 1, useProxy: true }
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers })
function bitmap() { globalThis.createImageBitmap = (async () => ({ width: 100, height: 100, close() {} })) as unknown as typeof createImageBitmap }

test('fixed model, ordered references, seed and single-output payload without credentials', () => {
  assert.deepEqual(pixAiSources(recipe), [recipe.portrait!.原图, recipe.costume!.预览图, recipe.pose!.原图])
  const body = pixAiPayload('three roles', { ...DEFAULT_PIXAI_PARAMS, seed: 42 }, ['portrait', 'costume', 'pose'])
  assert.equal(body.modelVersionId, '2024383379556065549')
  assert.equal(body.seed, 42)
  assert.equal(body.batchSize, 1)
  assert.equal(body.promptHelper, 'disable')
  assert.ok(!('width' in body) && !('height' in body) && !('apiKey' in body))
  assert.deepEqual(body.contextImages, ['portrait', 'costume', 'pose'])
  assert.throws(() => pixAiSources({ ...recipe, extraImages: [{ id: 'x', name: 'extra', url: 'x' }] }), /附加/)
  assert.throws(() => pixAiSources({ ...recipe, pose: null }), /三张/)
  assert.throws(() => pixAiBaseUrl('https://attacker.test'), /官方/)
  assert.throws(() => pixAiPayload('test', { ...DEFAULT_PIXAI_PARAMS, seed: NaN }, ['a', 'b', 'c']), /Seed/)
})

test('proxy buffers binary upload, uses actual body length, forwards retry-after, GET has no body', async () => {
  const seen: RequestInit[] = []
  globalThis.fetch = (async (_url, init) => { seen.push(init!); return json({ id: 'media' }, 429, { 'retry-after': '9' }) }) as typeof fetch
  const response = await handleProxy({ request: new Request('http://local/api/proxy', { method: 'POST', headers: { 'x-target-url': 'https://api.pixai.art/v1/media/upload', 'Content-Type': 'image/png' }, body: new Uint8Array([1, 2, 3]) }) })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '9')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(seen[0].body, new Uint8Array([1, 2, 3]))
  assert.equal(seen[0].redirect, 'manual')
  await worker.fetch(new Request('http://local/api/proxy', { headers: { 'x-target-url': 'https://api.pixai.art/v1/task/1' } }), { ASSETS: { fetch: async () => { throw new Error('not an asset') } } })
  assert.equal(seen[1].method, 'GET')
  assert.equal(seen[1].body, null)
})

test('proxy denies unauthorized destinations, methods, oversized declared and chunked bodies, and redirects', async () => {
  let count = 0
  globalThis.fetch = (async () => { count++; return new Response(null, { status: 302, headers: { location: 'https://attacker.test' } }) }) as typeof fetch
  const request = (url: string, options: RequestInit = {}) => new Request('http://local/api/proxy', { headers: { 'x-target-url': url }, ...options })
  assert.equal((await handleProxy({ request: request('https://attacker.test') })).status, 403)
  assert.equal((await handleProxy({ request: request('https://api.pixai.art.attacker.test') })).status, 403)
  assert.equal((await handleProxy({ request: request('https://api.pixai.art/v1/task/1', { method: 'DELETE' }) })).status, 405)
  assert.equal((await handleProxy({ request: request('https://api.pixai.art', { method: 'POST', headers: { 'x-target-url': 'https://api.pixai.art', 'content-length': '10485761' } }) })).status, 413)
  assert.equal((await handleProxy({ request: request('https://api.pixai.art', { method: 'POST', body: new Uint8Array(10485761) }) })).status, 413)
  assert.equal(count, 0)
  assert.equal((await handleProxy({ request: request('https://api.pixai.art') })).status, 502)
  assert.equal(count, 1)
})

test('uploads raw bytes in slot order, persists prepared payload before create; ambiguous create is never retried', async () => {
  bitmap()
  const calls: string[] = []
  let uploads = 0
  let creates = 0
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith('data:')) return new Response(new Uint8Array([0, 1, 2]), { headers: { 'content-type': 'image/png' } })
    const target = new Headers(init?.headers).get('x-target-url')!
    if (target.endsWith('/upload')) { assert.ok(init?.body instanceof Blob); calls.push(`upload${++uploads}`); return json({ id: `media${uploads}` }) }
    creates++; calls.push('create'); throw new TypeError('connection lost')
  }) as typeof fetch
  await assert.rejects(generateWithPixAi({ recipe, config, prompt: 'test', onSubmitting: async (prepared) => {
    calls.push('persist'); assert.deepEqual(prepared.payload.contextImages, ['media1', 'media2', 'media3']); assert.ok(!JSON.stringify(prepared).includes('test-secret'))
  } }), PixAiUnknownError)
  assert.deepEqual(calls, ['upload1', 'upload2', 'upload3', 'persist', 'create'])
  assert.equal(creates, 1)
})

test('persistence failure prevents submission, and failed task persistence reports its ID', async () => {
  bitmap()
  let creates = 0
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith('data:')) return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })
    const target = new Headers(init?.headers).get('x-target-url')!
    if (target.endsWith('/upload')) return json({ id: 'media' })
    creates++; return json({ id: 'known-task' })
  }) as typeof fetch
  await assert.rejects(generateWithPixAi({ recipe, config, prompt: 'test', onSubmitting: async () => { throw new Error('storage-full') } }), /storage-full/)
  assert.equal(creates, 0)
  await assert.rejects(generateWithPixAi({ recipe, config, prompt: 'test', onSubmitted: async () => { throw new Error('storage-full') } }), /known-task/)
  assert.equal(creates, 1)
})

test('resume only queries original task, reports terminal states and preserves download errors', async () => {
  globalThis.fetch = (async (_url, init) => { assert.equal(init?.method, undefined); assert.ok(new Headers(init?.headers).get('x-target-url')!.endsWith('/task/task-1')); return json({ status: 'failed' }) }) as typeof fetch
  await assert.rejects(resumePixAiTask({ task, apiKey: 'key' }), PixAiTerminalError)
  let count = 0
  globalThis.fetch = (async (_url, init) => {
    count++
    if (count === 1) return json({ status: 'completed', outputs: { mediaUrls: ['https://media.test/output.png'] } })
    assert.equal(new Headers(init?.headers).has('authorization'), false)
    return new Response('', { status: 503 })
  }) as typeof fetch
  await assert.rejects(resumePixAiTask({ task, apiKey: 'key' }), /图片下载失败/)
  assert.equal(count, 2)
  await assert.rejects(resumePixAiTask({ task: { ...task, baseUrl: 'https://attacker.test' }, apiKey: 'key' }), /官方/)
})

test('image preflight rejects unsupported MIME and oversized bytes with slot name', async () => {
  globalThis.fetch = (async () => new Response('bad', { headers: { 'content-type': 'text/html' } })) as typeof fetch
  await assert.rejects(preparePixAiImage('/ref', '服装'), /服装读取失败/)
  bitmap()
  globalThis.fetch = (async () => new Response(new Uint8Array(10485761), { headers: { 'content-type': 'image/png' } })) as typeof fetch
  await assert.rejects(preparePixAiImage('/ref', '姿势'), /姿势读取失败.*10 MiB/)
})

test('Flash shares reference contract, omits unsupported negatives and uses server default mode', async () => {
  const { PIXAI_FLASH_MODEL } = await import('../src/services/pixai')
  const body = pixAiPayload('test', { ...DEFAULT_PIXAI_PARAMS, negativePrompt: 'ignored by Flash' }, ['p', 'c', 's'], PIXAI_FLASH_MODEL)
  assert.equal(body.modelVersionId, PIXAI_FLASH_MODEL)
  assert.ok(!('negativePrompt' in body))
  assert.ok(!('mode' in body))
})

test('legacy config and ComfyUI handles migrate without losing other provider settings; history IDs remain stable', async () => {
  const { mergeStoredConfig, DEFAULT_API_CONFIG, shouldEnableProxyByDefault } = await import('../src/store/studioConfig')
  const { migrateActiveTask, taskHistoryId } = await import('../src/lib/generationTask')
  const old = structuredClone(DEFAULT_API_CONFIG) as Partial<ApiConfig>
  delete (old.providers as Partial<ApiConfig['providers']>).pixai
  delete old.pixaiParams
  old.providers!.gpt.apiKey = 'old-gpt-key'
  const cfg = mergeStoredConfig(old)
  assert.equal(cfg.providers.gpt.apiKey, 'old-gpt-key')
  assert.equal(cfg.providers.pixai.model, PIXAI_MODEL)
  assert.equal(cfg.pixaiParams.mode, 'default')
  assert.equal(shouldEnableProxyByDefault('pixai'), true)
  const legacy = { task: { baseUrl: 'http://old-comfy', promptId: 'old', clientId: 'client', submittedAt: 1 }, prompt: 'original', summary: 'original' }
  const migrated = migrateActiveTask(legacy)
  assert.equal(migrated.task?.provider, 'comfyui')
  assert.equal(taskHistoryId(migrated.task), 'comfy:http://old-comfy:old')
  assert.equal(taskHistoryId(task), taskHistoryId({ ...task }))
  assert.notEqual(taskHistoryId(task), taskHistoryId({ ...task, baseUrl: 'https://other.test' }))
})

test('generation snapshots omit every provider credential and keep both PixAI model choices', async () => {
  const { mergeStoredConfig } = await import('../src/store/studioConfig')
  const { snapshotGeneration } = await import('../src/lib/generationSnapshot')
  const cfg = mergeStoredConfig({ providers: { pixai: { apiKey: 'secret-pixai', model: '2050048243034896798' }, gpt: { apiKey: 'secret-gpt' } } })
  const snapshot = await snapshotGeneration({ portrait: null, costume: null, pose: null }, cfg, 'original prompt')
  assert.equal(snapshot.models.pixai.model, '2050048243034896798')
  assert.equal(snapshot.prompt, 'original prompt')
  assert.ok(!JSON.stringify(snapshot).includes('secret-'))
  assert.ok(!JSON.stringify(snapshot).includes('apiKey'))
})

test('recent task 404 is retried without submitting; abort stops tracking only', async () => {
  let calls = 0
  globalThis.fetch = (async () => { calls++; return calls === 1 ? json({ message: 'not found' }, 404) : json({ status: 'cancelled' }) }) as typeof fetch
  await assert.rejects(resumePixAiTask({ task: { ...task, submittedAt: Date.now() }, apiKey: 'key' }), PixAiTerminalError)
  assert.equal(calls, 2)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(resumePixAiTask({ task, apiKey: 'key', signal: controller.signal }), /abort/i)
  assert.equal(calls, 2)
})

test('existing providers retain POST stream and authentication headers', async () => {
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url), 'https://api.openai.com/v1/images/edits')
    assert.equal(init?.method, 'POST')
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer old-provider-key')
    assert.equal(await new Response(init?.body).text(), 'existing-payload')
    return json({ ok: true })
  }) as typeof fetch
  assert.equal((await handleProxy({ request: new Request('http://local/api/proxy', { method: 'POST', headers: { 'x-target-url': 'https://api.openai.com/v1/images/edits', authorization: 'Bearer old-provider-key', 'content-type': 'application/json' }, body: 'existing-payload' }) })).status, 200)
})

test('oversized dimensions shrink both sides below 4000 before upload', async () => {
  const previousDocument = globalThis.document
  globalThis.createImageBitmap = (async () => ({ width: 8000, height: 4000, close() {} })) as unknown as typeof createImageBitmap
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (done: (blob: Blob) => void) => done(new Blob(['png'], { type: 'image/png' })) }
  globalThis.document = { createElement: () => canvas } as unknown as Document
  globalThis.fetch = (async () => new Response('image', { headers: { 'content-type': 'image/png' } })) as typeof fetch
  try {
    assert.equal((await preparePixAiImage('/ref', '人像')).type, 'image/png')
    assert.equal(canvas.width, 3999)
    assert.equal(canvas.height, 1999)
  } finally { globalThis.document = previousDocument }
})
