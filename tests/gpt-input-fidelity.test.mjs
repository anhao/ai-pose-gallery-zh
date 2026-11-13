import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
})
after(() => server.close())
const { generateCharacterImage } = await server.ssrLoadModule('/src/services/aiGenerator.ts')
const reference = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6ioAAAAASUVORK5CYII='

async function captureRequest(model, endpointMode, inputFidelity = 'high', useProxy = false, customModel = '') {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, init) => {
    const payload = init.body instanceof FormData ? Object.fromEntries(init.body) : JSON.parse(init.body)
    requests.push({ url, headers: new Headers(init.headers), payload })
    return Response.json({ data: [{ b64_json: reference.split(',')[1] }] })
  }
  try {
    const result = await generateCharacterImage({
      recipe: { extraImages: [{ url: reference, name: 'reference' }] },
      prompt: 'Draw a blue circle.',
      config: {
        activeProvider: 'gpt', providers: { gpt: { model, customModel, baseUrl: 'https://api.openai.com/v1', apiKey: 'test-key' } },
        imagePassMode: 'url', sendStitchedSheet: false, useProxy,
        gptParams: { endpointMode, inputFidelity, size: '1024x1024', quality: 'low', background: 'auto', outputFormat: 'png', moderation: 'auto' },
      },
    })
    assert.equal(result.imageUrl, reference)
    assert.equal(requests.length, 1, 'must not retry a generation')
    return requests[0]
  } finally {
    globalThis.fetch = originalFetch
  }
}

const endpoints = ['images_edits_json', 'images_edits', 'responses']
for (const endpoint of endpoints) {
  for (const model of ['gpt-image-2', 'gpt-image-2-2026-04-21', 'gpt-image-2.5', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare-2026-09-08', 'gpt-image-2.6-flare', 'gpt-image-2.6-sunburst', 'chatgpt-image-latest', 'custom-alias']) {
    test(`${endpoint}: ${model} omits input_fidelity even with saved high/low settings`, async () => {
      for (const setting of ['high', 'low']) {
        const { payload } = await captureRequest(model, endpoint, setting)
        const options = endpoint === 'responses' ? payload.tools[0] : payload
        assert.equal(Object.hasOwn(options, 'input_fidelity'), false)
        assert.equal(options.quality, 'low')
        assert.equal(options.output_format, 'png')
      }
    })
  }
  for (const model of ['gpt-image-1', 'gpt-image-1.5', 'gpt-image-1.5-2025-12-16']) {
    test(`${endpoint}: ${model} preserves supported high/low settings`, async () => {
      for (const setting of ['high', 'low']) {
        const { payload } = await captureRequest(model, endpoint, setting)
        assert.equal((endpoint === 'responses' ? payload.tools[0] : payload).input_fidelity, setting)
      }
    })
  }
  test(`${endpoint}: mini never receives unsupported high fidelity`, async () => {
    for (const setting of ['high', 'low']) {
      const { payload } = await captureRequest('gpt-image-1-mini', endpoint, setting)
      assert.equal((endpoint === 'responses' ? payload.tools[0] : payload).input_fidelity, setting === 'low' ? 'low' : undefined)
    }
  })
}

test('custom GPT model uses the resolved model ID through the proxy', async () => {
  const { url, payload, headers } = await captureRequest('custom', 'images_edits_json', 'high', true, 'gpt-image-2.5-sunburst')
  assert.equal(url, '/api/proxy')
  assert.equal(headers.get('x-target-url'), 'https://api.openai.com/v1/images/edits')
  assert.equal(payload.model, 'gpt-image-2.5-sunburst')
  assert.equal(Object.hasOwn(payload, 'input_fidelity'), false)
  assert.equal(payload.images.length, 1)
})

test('chat compatibility endpoint remains unchanged', async () => {
  const { url, payload } = await captureRequest('gpt-image-2.5-sunburst', 'chat')
  assert.equal(url, 'https://api.openai.com/v1/chat/completions')
  assert.equal(Object.hasOwn(payload, 'input_fidelity'), false)
  assert.deepEqual(payload.modalities, ['text', 'image'])
})
