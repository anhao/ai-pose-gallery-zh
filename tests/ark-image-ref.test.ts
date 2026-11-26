import { afterEach, test } from 'node:test'
import assert from 'assert/strict'
import { generateCharacterImage, arkInputRefSupported, toArkImageRef } from '../src/services/aiGenerator'
import { mergeStoredConfig, DEFAULT_API_CONFIG } from '../src/store/studioConfig'
import type { ApiConfig, RecipeState } from '../src/types/gallery'

const nativeBitmap = globalThis.createImageBitmap
const previousDocument = globalThis.document
afterEach(() => {
  globalThis.createImageBitmap = nativeBitmap
  globalThis.document = previousDocument
})

// 模拟浏览器 canvas：decode 任意 blob 后重编码为 JPEG
// 构造带真实 AVIF 签名的 data URL（ftyp/avif），确保 MIME 探测命中
const avifDataUrl = (() => {
  const bytes = new Uint8Array(32)
  bytes.set(new TextEncoder().encode('ftyp'), 4)
  bytes.set(new TextEncoder().encode('avif'), 8)
  return `data:image/avif;base64,${btoa(String.fromCharCode(...bytes))}`
})()

const stubCanvas = () => {
  globalThis.createImageBitmap = (async () => ({ width: 100, height: 100, close() {} })) as unknown as typeof createImageBitmap
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({ drawImage() {} }),
      toDataURL: (type: string) => type === 'image/jpeg' ? `data:image/jpeg;base64,${btoa('fakejpeg')}` : `data:${type};base64,`,
    }),
  } as unknown as Document
}

const config = mergeStoredConfig({
  ...structuredClone(DEFAULT_API_CONFIG),
  activeProvider: 'byteplus',
  useProxy: true,
  providers: { byteplus: { baseUrl: '', apiKey: '', model: 'seedream-5-0-260128' } },
} as never) as ApiConfig

test('AVIF reference is transcoded into a supported MIME before reaching the Ark request body', async () => {
  stubCanvas()
  let body: { image?: string[] } | undefined
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const target = String(url)
    if (target.startsWith('data:')) {
      const bytes = Uint8Array.from(atob(target.split(',')[1]), (c) => c.charCodeAt(0))
      return new Response(bytes, { headers: { 'Content-Type': target.slice(5, target.indexOf(';')) } })
    }
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ data: [{ b64_json: 'AA==' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const recipe = {
    portrait: { source: 'upload', 原图: avifDataUrl },
    costume: { source: 'upload', 预览图: 'data:image/webp;base64,Ag==' },
    pose: { source: 'upload', 原图: avifDataUrl },
  } as unknown as RecipeState
  await generateCharacterImage({ recipe, prompt: 'p', config })
  assert.ok(body?.image)
  // 不被 Ark 接受的 AVIF 必须转码；Ark 本身支持的 webp 原样保留
  assert.match(body.image[0], /^data:image\/jpeg;base64,/)
  assert.equal(body.image[1], 'data:image/webp;base64,Ag==')
  assert.match(body.image[2], /^data:image\/jpeg;base64,/)
})

test('arkInputRefSupported and toArkImageRef agree on supported data URLs', async () => {
  const webp = 'data:image/webp;base64,Ag=='
  assert.equal(arkInputRefSupported(webp), true)
  assert.equal(arkInputRefSupported('data:image/avif;base64,AA=='), false)
  assert.equal(await toArkImageRef(webp), webp)
})
