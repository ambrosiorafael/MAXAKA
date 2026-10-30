import { createHmac } from 'node:crypto'
import type { MediaIceServerView } from '../src/realtime/protocol.ts'

export function createTurnIceServers(urls: string, sharedSecret: string, now = Date.now()): MediaIceServerView[] {
  const turnUrls = urls.split(',').map((url) => url.trim()).filter(Boolean)
  if (turnUrls.length === 0) return []
  if (!sharedSecret) throw new Error('O segredo partilhado TURN é obrigatório quando existem URLs TURN.')

  const username = `${Math.floor(now / 1000) + 7200}:maxaka`
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64')
  return [{ urls: turnUrls, username, credential, credentialType: 'password' }]
}

export function createPeerIceServers(urls: string, sharedSecret: string, now = Date.now()): MediaIceServerView[] {
  return [
    { urls: ['stun:stun.l.google.com:19302'] },
    ...createTurnIceServers(urls, sharedSecret, now),
  ]
}
