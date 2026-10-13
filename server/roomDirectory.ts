import { randomUUID } from 'node:crypto'
import { createClient, type RedisClientType } from 'redis'
import type { Server } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { config } from './config.ts'

export type RoomOwner = {
  instanceId: string
  publicUrl: string
}

const instanceId = randomUUID()
const leaseSeconds = 60
const heartbeatIntervalMs = 15_000
const roomKeyPrefix = 'maxaka:room-owner:'
const instanceKeyPrefix = 'maxaka:instance:'
const ownerValue = JSON.stringify({ instanceId, publicUrl: config.INSTANCE_PUBLIC_URL } satisfies RoomOwner)
const ownedRoomCodes = new Set<string>()
const redis = config.REDIS_URL ? createClient({ url: config.REDIS_URL }) : undefined
let publisher: RedisClientType | undefined
let subscriber: RedisClientType | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined

redis?.on('error', (error: unknown) => console.error('Erro na ligação Redis:', error))

function parseOwner(value: string): RoomOwner {
  let decoded: unknown
  try {
    decoded = JSON.parse(value)
  } catch (error) {
    throw new Error('O Redis contém um registo de sala inválido.', { cause: error })
  }
  if (
    typeof decoded !== 'object'
    || decoded === null
    || !('instanceId' in decoded)
    || typeof decoded.instanceId !== 'string'
    || !('publicUrl' in decoded)
    || typeof decoded.publicUrl !== 'string'
  ) {
    throw new Error('O Redis contém um registo de sala inválido.')
  }
  return { instanceId: decoded.instanceId, publicUrl: decoded.publicUrl }
}

export function isRoomDirectoryEnabled(): boolean {
  return redis !== undefined
}

export function getInstancePublicUrl(): string | undefined {
  return redis ? config.INSTANCE_PUBLIC_URL : undefined
}

export function getInstanceId(): string {
  return instanceId
}

export async function initializeRoomDirectory(
  socketServer: Server,
): Promise<void> {
  if (!redis) return
  await redis.connect()
  publisher = redis.duplicate()
  subscriber = redis.duplicate()
  publisher.on('error', (error: unknown) => console.error('Erro no Redis publisher:', error))
  subscriber.on('error', (error: unknown) => console.error('Erro no Redis subscriber:', error))
  await Promise.all([publisher.connect(), subscriber.connect()])
  socketServer.adapter(createAdapter(publisher, subscriber))
  await redis.set(`${instanceKeyPrefix}${instanceId}`, 'active', { EX: leaseSeconds })
  heartbeat = setInterval(() => {
    void refreshLeases().catch((error: unknown) => console.error('Falha ao renovar as concessões Redis:', error))
  }, heartbeatIntervalMs)
  heartbeat.unref()
}

async function refreshLeases(): Promise<void> {
  if (!redis) return
  await redis.set(`${instanceKeyPrefix}${instanceId}`, 'active', { EX: leaseSeconds })
  for (const roomCode of ownedRoomCodes) {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end",
      {
        keys: [`${roomKeyPrefix}${roomCode}`],
        arguments: [ownerValue, String(leaseSeconds)],
      },
    )
  }
}

export async function claimRoomOwner(roomCode: string): Promise<boolean> {
  if (!redis) return true
  const result = await redis.set(`${roomKeyPrefix}${roomCode}`, ownerValue, {
    EX: leaseSeconds,
    NX: true,
  })
  if (result !== 'OK') return false
  ownedRoomCodes.add(roomCode)
  return true
}

export async function findRoomOwner(roomCode: string): Promise<RoomOwner | undefined> {
  if (!redis) return undefined
  const key = `${roomKeyPrefix}${roomCode}`
  const value = await redis.get(key)
  if (!value) return undefined
  const owner = parseOwner(value)
  const ownerIsActive = await redis.exists(`${instanceKeyPrefix}${owner.instanceId}`)
  if (ownerIsActive) return owner
  await redis.del(key)
  return undefined
}

export async function releaseRoomOwner(roomCode: string): Promise<void> {
  ownedRoomCodes.delete(roomCode)
  if (!redis) return
  await redis.eval(
    "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
    { keys: [`${roomKeyPrefix}${roomCode}`], arguments: [ownerValue] },
  )
}

export async function closeRoomDirectory(): Promise<void> {
  if (heartbeat) clearInterval(heartbeat)
  if (!redis) return
  if (redis.isOpen) {
    for (const roomCode of ownedRoomCodes) await releaseRoomOwner(roomCode)
    await redis.del(`${instanceKeyPrefix}${instanceId}`)
  }
  await Promise.all([
    subscriber?.isOpen ? subscriber.quit() : undefined,
    publisher?.isOpen ? publisher.quit() : undefined,
    redis.isOpen ? redis.quit() : undefined,
  ])
}
