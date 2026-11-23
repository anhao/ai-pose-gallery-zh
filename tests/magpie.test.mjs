import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
})

after(() => server.close())
const { generateCharacterImage } = await server.ssrLoadModule('/src/services/aiGenerator.ts')
const { isGptFreeImageModel, resolveGptImageEndpoint, toMagpieProxyUrl } = await server.ssrLoadModule('/src/lib/magpie.ts')
const reference = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII='

async function captureRequest(endpointMode, { model = 'gptfree-pool/gpt-image-2.6', customModel = '', useProxy = false, source = reference } = {}) {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, headers: new Headers(init.headers), body: init.body })
    return Response.json({ data: [{ b64_json: reference.split(',')[1] }] })
  }
  try {
    const result = await generateCharacterImage({
      recipe: { extraImages: [{ url: source, name: 'reference' }] },
      prompt: 'Draw a blue circle.',
      config: {
        activeProvider: 'gpt',
        providers: { gpt: { model, customModel, baseUrl: 'http://127.0.0.1:3425/v1', apiKey: 'test-key' } },
        imagePassMode: 'url', sendStitchedSheet: false, useProxy,
        gptParams: { endpointMode, inputFidelity: 'high', size: '1024x1024', quality: 'low', background: 'auto', outputFormat: 'png', moderation: 'auto' },
      },
    })
    assert.equal(result.imageUrl, reference)
    assert.equal(requests.length, 1, 'generation must not be retried')
    return requests[0]
  } finally {
    globalThis.fetch = originalFetch
  }
}

test('only GPTFree pool image models use the compatibility override', () => {
  for (const model of ['gptfree-pool/gpt-image-2', 'gptfree-pool/gpt-image-2.6', 'gptfree-pool/gpt-image-2.6-flare', 'gptfree-pool/gpt-image-2.6-sunburst']) {
    assert.equal(isGptFreeImageModel(model), true, model)
    assert.equal(resolveGptImageEndpoint(model, 'chat'), 'images_edits')
    assert.equal(resolveGptImageEndpoint(model, 'responses'), 'images_edits')
    assert.equal(resolveGptImageEndpoint(model, 'images_edits'), 'images_edits')
    assert.equal(resolveGptImageEndpoint(model, 'images_edits_json'), 'images_edits_json')
  }
  for (const model of ['', 'gpt-image-2.6', 'gptfree-pool/gpt-6-luna', 'other/gpt-image-2.6', 'other-gptfree-pool/gpt-image-2.6']) {
    assert.equal(isGptFreeImageModel(model), false, model)
    for (const endpoint of ['chat', 'responses', 'images_edits', 'images_edits_json']) {
      assert.equal(resolveGptImageEndpoint(model, endpoint), endpoint)
    }
  }
})

for (const endpointMode of ['chat', 'responses']) {
  test(`GPTFree ${endpointMode} is sent as a multipart image edit`, async () => {
    const { url, headers, body } = await captureRequest(endpointMode)
    assert.equal(url, 'http://127.0.0.1:3425/v1/images/edits')
    assert.equal(headers.get('authorization'), 'Bearer test-key')
    assert.ok(body instanceof FormData)
    assert.equal(body.get('model'), 'gptfree-pool/gpt-image-2.6')
    const image = body.get('image[]')
    assert.ok(image instanceof Blob)
    assert.equal(image.type, 'image/png')
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array(Buffer.from(reference.split(',')[1], 'base64')))
    assert.equal(body.has('messages'), false)
  })
}

test('custom model IDs receive the same GPTFree endpoint compatibility', async () => {
  const { url, body } = await captureRequest('chat', { model: 'custom', customModel: 'gptfree-pool/gpt-image-2.6-flare' })
  assert.equal(url, 'http://127.0.0.1:3425/v1/images/edits')
  assert.ok(body instanceof FormData)
  assert.equal(body.get('model'), 'gptfree-pool/gpt-image-2.6-flare')
})

test('GPTFree JSON edits send inline image data with URL mode saved', async () => {
  const { url, headers, body } = await captureRequest('images_edits_json')
  assert.equal(url, 'http://127.0.0.1:3425/v1/images/edits')
  assert.equal(headers.get('content-type'), 'application/json')
  const payload = JSON.parse(body)
  assert.equal(payload.model, 'gptfree-pool/gpt-image-2.6')
  assert.deepEqual(payload.images, [{ image_url: reference }])
  assert.equal(payload.images.some((image) => /^https?:/.test(image.image_url)), false)
})

test('GPTFree JSON edits convert a remote reference to image data before submitting', async () => {
  const originalImage = globalThis.Image
  const originalDocument = globalThis.document
  const source = 'https://references.example/portrait.png'
  const loaded = []
  let drawn = 0
  globalThis.Image = class {
    width = 64
    height = 64
    set src(value) {
      loaded.push(value)
      queueMicrotask(() => this.onload())
    }
  }
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas')
      return {
        getContext(kind) {
          assert.equal(kind, '2d')
          return { drawImage() { drawn++ } }
        },
        toDataURL(mime) {
          assert.equal(mime, 'image/png')
          return reference
        },
      }
    },
  }
  try {
    const { url, body } = await captureRequest('images_edits_json', { source })
    assert.equal(url, 'http://127.0.0.1:3425/v1/images/edits')
    assert.deepEqual(loaded, [source])
    assert.equal(drawn, 1)
    assert.deepEqual(JSON.parse(body).images, [{ image_url: reference }])
    assert.equal(body.includes(source), false)
  } finally {
    if (originalImage === undefined) delete globalThis.Image
    else globalThis.Image = originalImage
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

for (const useProxy of [false, true]) {
  test(`local Magpie uses its same-origin route when general proxy is ${useProxy}`, async () => {
    const originalWindow = globalThis.window
    globalThis.window = { location: { href: 'http://127.0.0.1:5173/studio' } }
    try {
      const { url, headers, body } = await captureRequest('chat', { useProxy })
      assert.equal(url, '/magpie/v1/images/edits')
      assert.equal(headers.has('x-target-url'), false)
      assert.ok(body instanceof FormData)
      assert.equal(body.get('model'), 'gptfree-pool/gpt-image-2.6')
    } finally {
      if (originalWindow === undefined) delete globalThis.window
      else globalThis.window = originalWindow
    }
  })
}

test('ordinary GPT chat requests retain their endpoint and message format', async () => {
  const { url, body } = await captureRequest('chat', { model: 'gpt-image-2.6-flare' })
  assert.equal(url, 'http://127.0.0.1:3425/v1/chat/completions')
  const payload = JSON.parse(body)
  assert.equal(payload.model, 'gpt-image-2.6-flare')
  assert.deepEqual(payload.modalities, ['text', 'image'])
  assert.equal(payload.messages[0].content[1].image_url.url, reference)
  assert.equal(Object.hasOwn(payload, 'images'), false)
})

test('Magpie proxy only maps the loopback API on local pages', () => {
  for (const pageUrl of ['http://127.0.0.1:5173/studio', 'http://localhost:5173/', 'http://[::1]:5173/']) {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      assert.equal(toMagpieProxyUrl(`http://${host}:3425/v1`, pageUrl), '/magpie/v1')
      assert.equal(toMagpieProxyUrl(`http://${host}:3425/v1/images/edits?mode=test`, pageUrl), '/magpie/v1/images/edits?mode=test')
    }
    assert.equal(toMagpieProxyUrl('/magpie/v1/images/edits?mode=test', pageUrl), '/magpie/v1/images/edits?mode=test')
  }
  const localPage = 'http://127.0.0.1:5173/'
  for (const targetUrl of [
    'https://127.0.0.1:3425/v1/images/edits',
    'http://127.0.0.1:3426/v1/images/edits',
    'http://127.0.0.1/v1/images/edits',
    'http://192.168.1.2:3425/v1/images/edits',
    'http://localhost.example:3425/v1/images/edits',
    'https://api.example/v1/images/edits',
    'http://localhost:3425/private',
    'http://localhost:3425/v10/images/edits',
    'http://localhost:3425/v1/../private',
    '/magpie/private',
    '/magpie/v10/images/edits',
    'not a URL',
  ]) assert.equal(toMagpieProxyUrl(targetUrl, localPage), null, targetUrl)
  for (const pageUrl of ['https://gallery.example/studio', 'http://localhost.example:5173/', 'http://192.168.1.2:5173/']) {
    assert.equal(toMagpieProxyUrl('http://127.0.0.1:3425/v1/images/edits', pageUrl), null, pageUrl)
    assert.equal(toMagpieProxyUrl('/magpie/v1/images/edits', pageUrl), null, pageUrl)
  }
})
