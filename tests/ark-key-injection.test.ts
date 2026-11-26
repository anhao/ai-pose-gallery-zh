import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleProxy } from '../functions/api/proxy.ts'

const post = (target: string, env?: { ARK_API_KEY?: string }, headers: Record<string, string> = {}) =>
  handleProxy({
    request: new Request('http://localhost/api/proxy', {
      method: 'POST',
      headers: { 'x-target-url': target, ...headers },
    }),
    env,
  })

test('injects ARK_API_KEY only for Ark hosts, only when the header is missing, only when set', async () => {
  const seen: Headers[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (_url: any, init: any) => {
    const h = new Headers(init?.headers)
    seen.push(h)
    return new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  try {
    // Ark host + env set + no header → injected
    await post('https://ark.ap-southeast.bytepluses.com/api/v3/models', { ARK_API_KEY: 'test-key' })
    assert.equal(seen.at(-1)!.get('authorization'), 'Bearer test-key')

    // Non-Ark host → not injected
    await post('https://api.openai.com/v1/models', { ARK_API_KEY: 'test-key' })
    assert.equal(seen.at(-1)!.get('authorization'), null)

    // Ark host but caller supplied own Authorization → forwarded, not overwritten
    await post('https://ark.ap-southeast.bytepluses.com/api/v3/models', { ARK_API_KEY: 'test-key' }, { authorization: 'Bearer mine' })
    assert.equal(seen.at(-1)!.get('authorization'), 'Bearer mine')

    // Ark host, header missing, env unset → no injection
    await post('https://ark.ap-southeast.bytepluses.com/api/v3/models', {})
    assert.equal(seen.at(-1)!.get('authorization'), null)
  } finally {
    globalThis.fetch = realFetch
  }
})
