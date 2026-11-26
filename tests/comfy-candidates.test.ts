import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comfyCandidateUrls, detectComfyUi } from '../src/services/aiGenerator'

test('candidate list always includes /comfy after current value, deduped', () => {
  const list = comfyCandidateUrls('http://10.20.0.126:8188')
  assert.equal(list[0], 'http://10.20.0.126:8188')
  assert.equal(list[1], '/comfy')
  assert.ok(list.includes('http://127.0.0.1:8000'))
  // on localhost, /comfy (default) is deduped to one entry
  assert.equal(new Set(comfyCandidateUrls('/comfy')).size, comfyCandidateUrls('/comfy').length)
})

test('detectComfyUi rejects HTML 200 SPA fallback and succeeds on a later candidate', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: any) => {
    const url = String(input)
    if (url.includes('/comfy/')) {
      return new Response('<!doctype html><html><body>app</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }
    if (!url.includes('127.0.0.1:8000')) return new Response('nope', { status: 404 })
    return new Response(JSON.stringify({ system: { comfyui_version: '0.3.0' }, devices: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  try {
    const found = await detectComfyUi('http://10.20.0.126:8188')
    assert.ok(found)
    assert.equal(found!.baseUrl, 'http://127.0.0.1:8000')
  } finally {
    globalThis.fetch = realFetch
  }
})
