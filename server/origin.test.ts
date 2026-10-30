import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAllowedOrigin, parseAllowedOrigins } from './config.ts'

test('accepts localhost and loopback aliases for the same frontend origin', () => {
  const allowed = 'http://localhost:5173,http://127.0.0.1:5173'

  assert.deepEqual(parseAllowedOrigins(allowed), ['http://localhost:5173', 'http://127.0.0.1:5173'])
  assert.equal(isAllowedOrigin('http://localhost:5173', allowed), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173', allowed), true)
  assert.equal(isAllowedOrigin('http://localhost:3001', allowed), false)
  assert.equal(isAllowedOrigin('https://localhost:5173', allowed), false)
})
