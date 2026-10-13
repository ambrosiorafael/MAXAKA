import { performance } from 'node:perf_hooks'
import { io } from 'socket.io-client'

const urls = (process.env.LOAD_SERVER_URLS ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean)
const userCount = Number(process.env.LOAD_USERS ?? 1000)
const roomSize = Number(process.env.LOAD_ROOM_SIZE ?? 20)
const batchSize = 50
const roomBusyMessage = 'A sala está a processar outra ação. Tenta novamente.'

if (urls.length === 0) throw new Error('Define LOAD_SERVER_URLS com os endereços públicos das instâncias, separados por vírgulas.')
if (!Number.isInteger(userCount) || userCount < 2) throw new Error('LOAD_USERS tem de ser um inteiro igual ou superior a 2.')
if (!Number.isInteger(roomSize) || roomSize < 2 || roomSize > 30) throw new Error('LOAD_ROOM_SIZE tem de estar entre 2 e 30.')

const clients = []
const hosts = []
const timings = []
const rooms = []

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      autoConnect: false,
      reconnection: false,
      timeout: 10_000,
      transports: ['websocket'],
    })
    const timeout = setTimeout(() => {
      socket.disconnect()
      reject(new Error(`Ligação excedeu o tempo limite: ${url}`))
    }, 12_000)
    socket.once('connect', () => {
      clearTimeout(timeout)
      clients.push(socket)
      resolve(socket)
    })
    socket.once('connect_error', (error) => {
      clearTimeout(timeout)
      socket.disconnect()
      reject(error)
    })
    socket.connect()
  })
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const started = performance.now()
    const acknowledge = (timeoutError, result) => {
      if (timeoutError) {
        reject(timeoutError)
        return
      }
      if (!result) {
        reject(new Error(`O servidor não confirmou o evento ${event}.`))
        return
      }
      timings.push(performance.now() - started)
      resolve(result)
    }
    if (payload === undefined) socket.timeout(10_000).emit(event, acknowledge)
    else socket.timeout(10_000).emit(event, payload, acknowledge)
  })
}

async function bounded(items, limit, action) {
  for (let start = 0; start < items.length; start += limit) {
    const batch = items.slice(start, start + limit)
    const results = await Promise.allSettled(batch.map((item, index) => action(item, start + index)))
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }
}

async function joinRoom(initialSocket, payload) {
  let socket = initialSocket
  let redirects = 0
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await emitAck(socket, 'room:join', payload)
    if (result.ok) return socket
    if (result.redirectTo && redirects === 0) {
      socket.disconnect()
      socket = await connect(result.redirectTo)
      redirects += 1
      continue
    }
    if (result.error === roomBusyMessage) {
      await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100))
      continue
    }
    throw new Error(result.error)
  }
  throw new Error('A sala continuou ocupada depois de 30 tentativas.')
}

async function leaveHost(socket) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await emitAck(socket, 'room:leave')
    if (result.ok) return
    if (result.error !== roomBusyMessage) throw new Error(result.error)
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100))
  }
  throw new Error('Não foi possível encerrar a sala de teste após 30 tentativas.')
}

try {
  const started = performance.now()
  const roomCount = Math.ceil(userCount / roomSize)
  const membersPerRoom = Array.from({ length: roomCount }, (_, index) =>
    Math.min(roomSize, userCount - index * roomSize),
  )
  let nextHostEndpoint = 0

  await bounded(membersPerRoom, 10, async (_, roomIndex) => {
    const endpointIndex = nextHostEndpoint++
    const socket = await connect(urls[endpointIndex % urls.length])
    const created = await emitAck(socket, 'room:create', {
      name: `Anfitriao ${endpointIndex + 1}`,
      avatar: '🦁',
      teamCount: Math.max(2, Math.ceil(membersPerRoom[roomIndex] / 6)),
    })
    if (!created.ok) throw new Error(created.error)
    hosts.push({ socket, code: created.data.room.code })
    rooms.push({ code: created.data.room.code, remaining: membersPerRoom[roomIndex] - 1 })
  })

  let memberNumber = hosts.length
  const joinRequests = rooms.flatMap((room) =>
    Array.from({ length: room.remaining }, () => ({ roomCode: room.code, number: ++memberNumber })),
  )
  let nextGuestEndpoint = 0
  await bounded(joinRequests, batchSize, async (request) => {
    const guest = await connect(urls[nextGuestEndpoint++ % urls.length])
    await joinRoom(guest, {
      code: request.roomCode,
      name: `Jogador ${request.number}`,
      avatar: '😀',
    })
  })

  const elapsedSeconds = (performance.now() - started) / 1000
  const sorted = [...timings].sort((left, right) => left - right)
  const percentile = (value) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]
  console.log(JSON.stringify({
    connectedPlayers: clients.length,
    rooms: hosts.length,
    roomSize,
    elapsedSeconds: Number(elapsedSeconds.toFixed(2)),
    eventLatencyMs: {
      p50: Number(percentile(0.5)?.toFixed(1) ?? 0),
      p95: Number(percentile(0.95)?.toFixed(1) ?? 0),
      p99: Number(percentile(0.99)?.toFixed(1) ?? 0),
    },
  }, null, 2))
} finally {
  await Promise.all(hosts.map(({ socket }) =>
    leaveHost(socket).catch((error) => console.error('Falha ao encerrar uma sala do ensaio:', error)),
  ))
  for (const socket of clients) socket.disconnect()
}
