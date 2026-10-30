import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { createPeerIceServers, createTurnIceServers } from './media.ts'

test('uses public STUN for peer audio and adds configured TURN relay servers', () => {
  const iceServers = createPeerIceServers('turn:relay.example.test:3478', 'server-only-secret', 1000)
  assert.deepEqual(iceServers[0], { urls: ['stun:stun.l.google.com:19302'] })
  assert.equal(iceServers[1]?.urls[0], 'turn:relay.example.test:3478')
  assert.equal(iceServers[1]?.username, '7201:maxaka')
})

test('leaves TURN disabled when no relay URLs are configured', () => {
  assert.deepEqual(createTurnIceServers('', ''), [])
})

test('creates short-lived coturn REST credentials without exposing the shared secret', () => {
  const sharedSecret = 'server-only-secret'
  const username = '7201:maxaka'
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64')

  assert.deepEqual(
    createTurnIceServers('turn:relay.example.test:3478?transport=udp, turns:relay.example.test:5349', sharedSecret, 1000),
    [{
      urls: ['turn:relay.example.test:3478?transport=udp', 'turns:relay.example.test:5349'],
      username,
      credential,
      credentialType: 'password',
    }],
  )
  assert.notEqual(credential, sharedSecret)
})

test('rejects TURN configuration without a shared secret', () => {
  assert.throws(() => createTurnIceServers('turn:relay.example.test:3478', ''))
})
