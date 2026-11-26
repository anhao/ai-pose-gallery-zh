import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUuid } from '../src/lib/uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('randomUuid returns valid v4 UUIDs without crypto.randomUUID', () => {
  const original = crypto.randomUUID
  // @ts-expect-error simulate insecure context
  delete crypto.randomUUID
  try {
    const a = randomUuid()
    const b = randomUuid()
    assert.match(a, V4)
    assert.notEqual(a, b)
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true, writable: true })
  }
})
