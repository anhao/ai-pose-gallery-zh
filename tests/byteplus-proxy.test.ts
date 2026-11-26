import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { generateCharacterImage } from '../src/services/aiGenerator'
import { mergeStoredConfig } from '../src/store/studioConfig'
import type { ApiConfig, RecipeState } from '../src/types/gallery'

const nativeFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = nativeFetch })

const recipe = { portrait: { 原图: 'data:image/png;base64,AA==' } } as RecipeState

const byteplusConfig = (useProxy: boolean) =>
  mergeStoredConfig({ activeProvider: 'byteplus', useProxy, comfyuiParams: { configVersion: 3 } as never }) as ApiConfig

test('byteplus + proxy + empty key passes pre-check and sends no Authorization header (proxy injects)', async () => {
  let seenAuth: string | null | undefined
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    seenAuth = new Headers(init?.headers).get('authorization')
    return new Response(JSON.stringify({ data: [{ b64_json: 'AA==' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  const result = await generateCharacterImage({ recipe, prompt: 'p', config: byteplusConfig(true) })
  assert.equal(seenAuth, null)
  assert.match(result.imageUrl, /^data:image\/png;base64,/)
})

test('byteplus without proxy and empty key still errors with the BytePlus name', async () => {
  await assert.rejects(
    generateCharacterImage({ recipe, prompt: 'p', config: byteplusConfig(false) }),
    /ModelArk/,
  )
})

test('byteplus default model/params omits sequential_image_generation from the request body', async () => {
  let body: Record<string, unknown> | undefined
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ data: [{ b64_json: 'AA==' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  await generateCharacterImage({ recipe, prompt: 'p', config: byteplusConfig(true) })
  assert.ok(body)
  assert.equal('sequential_image_generation' in body, false)
  // 开启组图但模型不支持时同样不发送
  const cfg = { ...byteplusConfig(true), doubaoParams: { ...byteplusConfig(true).doubaoParams, sequentialImageGeneration: 'auto' } } as ApiConfig
  body = undefined
  await generateCharacterImage({ recipe, prompt: 'p', config: cfg })
  assert.equal('sequential_image_generation' in (body as object), false)
})
