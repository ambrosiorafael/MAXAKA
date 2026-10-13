import { randomInt, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Server as SocketServer, type Socket } from 'socket.io'
import type { types as MediaTypes } from 'mediasoup-client'
import { z, ZodError } from 'zod'
import { avatarOptions, isAvatar } from '../src/game/avatars.ts'
import { currentTeam, endAutomatedTurn, resolveCurrentItem, startMatch, tickMatch, type MatchState } from '../src/game/engine.ts'
import type {
  Ack,
  ClientToServerEvents,
  ChatMessageView,
  MatchStateView,
  PrivateTurnView,
  RoomStateView,
  ServerToClientEvents,
} from '../src/realtime/protocol.ts'
import { config } from './config.ts'
import { closeDatabase, database, initializeDatabase, loadPublishedCards } from './db.ts'
import {
  closeMediaWorker,
  closeMemberMedia,
  closeMemberMediaProducer,
  closeRoomMedia,
  closeRoomMediaKind,
  connectMediaTransport,
  consumeMedia,
  createMediaTransport,
  initializeMediaWorker,
  joinMediaRoom,
  produceMedia,
  resumeMediaConsumer,
} from './media.ts'
import {
  claimRoomOwner,
  closeRoomDirectory,
  findRoomOwner,
  getInstanceId,
  getInstancePublicUrl,
  initializeRoomDirectory,
  isRoomDirectoryEnabled,
  releaseRoomOwner,
} from './roomDirectory.ts'

type ServerSocketData = {
  memberId?: string
  roomCode?: string
}

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, ServerSocketData>

type RoomMember = {
  id: string
  name: string
  avatar: string
  teamId: number
  isBot: boolean
  isHost: boolean
  isOnline: boolean
  socketId?: string
  sessionToken?: string
  hostDisconnectTimer?: ReturnType<typeof setTimeout>
}

type OnlineRoom = {
  id: string
  code: string
  status: 'open' | 'playing' | 'finished'
  hostId: string
  teamCount: number
  mediaSettings: RoomStateView['mediaSettings']
  members: RoomMember[]
  matchId?: string
  match?: MatchState
  teamDatabaseIds?: Map<number, string>
  turnDatabaseId?: string
  turnNumber: number
  giverMemberId?: string
  timer?: ReturnType<typeof setInterval>
  botTimer?: ReturnType<typeof setTimeout>
  closing: boolean
  chatRate: Map<string, number[]>
  processing: boolean
}

type AckPayload = { room: RoomStateView; sessionToken: string; memberId: string; serverUrl?: string }

const nameSchema = z.string().trim().min(2).max(24).refine(
  (value) => [...value].every((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && codePoint > 0x1f && codePoint !== 0x7f
  }),
  'O nome contém caracteres não permitidos.',
)
const avatarSchema = z.string().refine(isAvatar, 'Escolhe um avatar disponível.')
const createRoomSchema = z.object({
  name: nameSchema,
  avatar: avatarSchema,
  teamCount: z.number().int().min(2).max(5),
  mediaSettings: z.object({
    audioEnabled: z.boolean(),
    videoEnabled: z.boolean(),
    textChatEnabled: z.boolean(),
    mimeEnabled: z.boolean(),
  }).optional(),
})
const joinRoomSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/u, 'O código deve ter seis caracteres.'),
  name: nameSchema,
  avatar: avatarSchema,
})
const teamSchema = z.object({ memberId: z.string().uuid(), teamId: z.number().int().min(1).max(5) })
const addBotSchema = z.object({ teamId: z.number().int().min(1).max(5) })
const resolveSchema = z.object({ correct: z.boolean() })
const chatSchema = z.object({ text: z.string().trim().min(1).max(300) })
const roomSettingsSchema = z.object({
  audioEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
  textChatEnabled: z.boolean().optional(),
  mimeEnabled: z.boolean().optional(),
}).strict().refine((settings) => Object.keys(settings).length > 0, 'Seleciona pelo menos uma permissão.')
const closeProducerSchema = z.object({ producerId: z.string().min(1).max(128) })
const transportSchema = z.object({ direction: z.enum(['send', 'receive']) })
const connectTransportSchema = z.object({
  transportId: z.string().min(1).max(128),
  dtlsParameters: z.custom<MediaTypes.DtlsParameters>(isDtlsParameters),
})
const produceSchema = z.object({
  transportId: z.string().min(1).max(128),
  kind: z.enum(['audio', 'video']),
  rtpParameters: z.custom<MediaTypes.RtpParameters>(isRtpParameters),
})
const consumeSchema = z.object({
  transportId: z.string().min(1).max(128),
  producerId: z.string().min(1).max(128),
  rtpCapabilities: z.custom<MediaTypes.RtpCapabilities>(isRtpCapabilities),
})
const resumeConsumerSchema = z.object({ consumerId: z.string().min(1).max(128) })

const rooms = new Map<string, OnlineRoom>()
const sessions = new Map<string, { roomCode: string; memberId: string }>()
const botNames = ['Paito', 'Ana', 'Maria', 'João', 'Marcos', 'José', 'Shelton', 'Sharmyla', 'Andressa', 'Winney', 'Sónia', 'Telma']
const teamColors = ['orange', 'blue', 'green', 'purple', 'pink']
const roomAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

const httpServer = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ status: 'ok' }))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: 'Rota não encontrada.' }))
})

const io = new SocketServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, ServerSocketData>(httpServer, {
  cors: { origin: config.CLIENT_ORIGIN, methods: ['GET', 'POST'] },
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000, skipMiddlewares: true },
})

class ClientError extends Error {}

class RedirectError extends ClientError {
  constructor(message: string, readonly redirectTo: string) {
    super(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDtlsParameters(value: unknown): value is MediaTypes.DtlsParameters {
  if (!isRecord(value) || !Array.isArray(value.fingerprints) || value.fingerprints.length === 0) return false
  if (value.role !== undefined && !['auto', 'client', 'server'].includes(String(value.role))) return false
  return value.fingerprints.every((fingerprint) => (
    isRecord(fingerprint)
    && ['sha-1', 'sha-224', 'sha-256', 'sha-384', 'sha-512'].includes(String(fingerprint.algorithm))
    && typeof fingerprint.value === 'string'
  ))
}

function isRtpParameters(value: unknown): value is MediaTypes.RtpParameters {
  return isRecord(value)
    && Array.isArray(value.codecs)
    && Array.isArray(value.headerExtensions)
    && (value.encodings === undefined || Array.isArray(value.encodings))
    && isRecord(value.rtcp)
}

function isRtpCapabilities(value: unknown): value is MediaTypes.RtpCapabilities {
  return isRecord(value) && Array.isArray(value.codecs) && Array.isArray(value.headerExtensions)
}

function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input)
  } catch (error) {
    if (error instanceof ZodError) throw new ClientError(error.issues[0]?.message ?? 'Dados inválidos.')
    throw error
  }
}

function withAck<T>(ack: Ack<T>, action: () => Promise<T>): void {
  if (typeof ack !== 'function') {
    console.warn('Pedido Socket.IO recebido sem função de confirmação.')
    return
  }
  void action().then(
    (data) => ack({ ok: true, data }),
    (error: unknown) => {
      if (!(error instanceof ClientError)) console.error('Falha numa operação de sala:', error)
      ack({
        ok: false,
        error: error instanceof ClientError ? error.message : 'O servidor encontrou um erro. Tenta novamente.',
        ...(error instanceof RedirectError ? { redirectTo: error.redirectTo } : {}),
      })
    },
  )
}

function getRoom(socket: AppSocket): OnlineRoom {
  const room = socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined
  if (!room || !socket.data.memberId) throw new ClientError('Não estás numa sala.')
  const member = room.members.find((candidate) => candidate.id === socket.data.memberId)
  if (!member || member.socketId !== socket.id) throw new ClientError('A tua sessão já não está ativa nesta sala.')
  return room
}

function getMember(room: OnlineRoom, socket: AppSocket): RoomMember {
  const member = room.members.find((candidate) => candidate.id === socket.data.memberId)
  if (!member) throw new ClientError('O participante já não está nesta sala.')
  return member
}

async function withRoomLock<T>(room: OnlineRoom, action: () => Promise<T>): Promise<T> {
  if (room.processing) throw new ClientError('A sala está a processar outra ação. Tenta novamente.')
  room.processing = true
  try {
    return await action()
  } finally {
    room.processing = false
  }
}

function roomView(room: OnlineRoom): RoomStateView {
  return {
    code: room.code,
    status: room.status,
    hostId: room.hostId,
    teamCount: room.teamCount,
    mediaSettings: { ...room.mediaSettings },
    members: room.members.map(({ id, name, avatar, teamId, isBot, isHost, isOnline }) => ({
      id, name, avatar, teamId, isBot, isHost, isOnline,
    })),
  }
}

function publishRoom(room: OnlineRoom): void {
  io.to(room.code).emit('room:state', roomView(room))
}

function matchView(room: OnlineRoom): MatchStateView | undefined {
  const match = room.match
  if (!match) return undefined
  const team = currentTeam(match)
  return {
    status: match.status,
    currentTeamId: team?.id ?? 0,
    currentTeamName: team?.name ?? '',
    secondsLeft: match.secondsLeft,
    boardLength: match.boardLength,
    winnerTeamId: match.winnerTeamId,
    turnIndex: room.turnNumber,
    category: match.turn?.card.category ?? '',
    teams: match.teams.map((entry) => ({
      id: entry.id,
      name: entry.name,
      color: entry.color,
      position: entry.position,
      members: room.members
        .filter((member) => member.teamId === entry.id)
        .map(({ id, name, avatar, isBot }) => ({ id, name, avatar, isBot })),
    })),
  }
}

function publishMatch(room: OnlineRoom): void {
  const state = matchView(room)
  if (state) io.to(room.code).emit('match:state', state)
}

function broadcastPrivateTurn(room: OnlineRoom): void {
  const match = room.match
  const team = match ? currentTeam(match) : undefined
  const turn = match?.turn
  if (!match || !team || !turn) return

  room.giverMemberId = undefined
  const teammates = room.members.filter((member) => member.teamId === team.id && !member.isBot)
  let giver: RoomMember | undefined
  if (turn.role === 'human-gives' && teammates.length > 0) {
    const played = match.teamTurnsPlayed[team.id] ?? 0
    giver = teammates[played % teammates.length]
    room.giverMemberId = giver?.id
  }

  for (const member of teammates) {
    if (!member.socketId) continue
    let privateTurn: PrivateTurnView
    if (turn.role === 'automated') {
      privateTurn = { teamId: team.id, role: 'automated', itemIndex: turn.itemIndex, category: turn.card.category }
    } else if (turn.role === 'human-guesses') {
      privateTurn = {
        teamId: team.id,
        role: 'human-guesses',
        itemIndex: turn.itemIndex,
        category: turn.card.category,
        item: turn.card.items[turn.itemIndex],
      }
    } else if (member.id === giver?.id) {
      privateTurn = {
        teamId: team.id,
        role: 'human-gives',
        itemIndex: turn.itemIndex,
        category: turn.card.category,
        items: turn.card.items,
      }
    } else {
      privateTurn = { teamId: team.id, role: 'watching', itemIndex: turn.itemIndex, category: turn.card.category }
    }
    io.to(member.socketId).emit('turn:private', privateTurn)
  }
}

async function persistPositions(room: OnlineRoom): Promise<void> {
  if (!room.match || !room.teamDatabaseIds) return
  for (const team of room.match.teams) {
    const teamDatabaseId = room.teamDatabaseIds.get(team.id)
    if (!teamDatabaseId) throw new Error(`A equipa ${team.id} não tem registo de base de dados.`)
    await database.execute(
      'UPDATE teams SET board_position = ?, score = ? WHERE id = ?',
      [team.position, team.position, teamDatabaseId],
    )
  }
}

async function finishMatch(room: OnlineRoom): Promise<void> {
  const match = room.match
  const matchId = room.matchId
  const teamDatabaseIds = room.teamDatabaseIds
  if (!match || !matchId || !teamDatabaseIds || match.status !== 'finished') return

  if (room.turnDatabaseId) {
    await database.execute('UPDATE match_turns SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [room.turnDatabaseId])
  }
  const orderedTeams = [...match.teams].sort((left, right) => right.position - left.position || left.id - right.id)
  await database.execute(
    `UPDATE matches
        SET status = 'finished', ended_at = CURRENT_TIMESTAMP,
            winner_team_id = ?
      WHERE id = ?`,
    [match.winnerTeamId ? teamDatabaseIds.get(match.winnerTeamId) ?? null : null, matchId],
  )
  for (const [index, team] of orderedTeams.entries()) {
    const teamDatabaseId = teamDatabaseIds.get(team.id)
    if (!teamDatabaseId) throw new Error(`A equipa ${team.id} não tem registo de base de dados.`)
    await database.execute(
      `INSERT INTO match_results (match_id, team_id, final_score, final_position, placement)
       VALUES (?, ?, ?, ?, ?)`,
      [matchId, teamDatabaseId, team.position, team.position, index + 1],
    )
  }
  room.status = 'finished'
  await database.execute(
    "UPDATE rooms SET status = 'finished', closed_at = CURRENT_TIMESTAMP WHERE id = ?",
    [room.id],
  )
  for (const member of room.members) {
    await database.execute('DELETE FROM players WHERE id = ?', [member.id])
  }
  for (const member of room.members) {
    if (member.sessionToken) sessions.delete(member.sessionToken)
    member.sessionToken = undefined
  }
  if (room.timer) clearInterval(room.timer)
  if (room.botTimer) clearTimeout(room.botTimer)
}

async function persistTurn(room: OnlineRoom, previousTurnId?: string): Promise<void> {
  if (previousTurnId) {
    await database.execute('UPDATE match_turns SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [previousTurnId])
  }

  const match = room.match
  const matchId = room.matchId
  const teamDatabaseIds = room.teamDatabaseIds
  const turn = match?.turn
  const team = match ? currentTeam(match) : undefined
  if (!match || !matchId || !teamDatabaseIds || !turn || !team || match.status !== 'playing') {
    room.turnDatabaseId = undefined
    return
  }

  const teamDatabaseId = teamDatabaseIds.get(team.id)
  if (!teamDatabaseId) throw new Error(`A equipa ${team.id} não tem registo de base de dados.`)
  room.turnDatabaseId = randomUUID()
  room.turnNumber += 1
  await database.execute(
    `INSERT INTO match_turns (id, match_id, team_id, player_id, card_id, turn_number)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      room.turnDatabaseId,
      matchId,
      teamDatabaseId,
      room.giverMemberId && turn.role === 'human-gives' ? room.giverMemberId : null,
      turn.card.id,
      room.turnNumber,
    ],
  )
}

async function persistResolvedItem(room: OnlineRoom, itemIndex: number, correct: boolean): Promise<void> {
  if (!room.match || !room.turnDatabaseId) throw new Error('A ronda ativa não tem registo persistente.')
  const cardId = room.match.turn?.card.id
  if (!cardId) throw new Error('A carta ativa não foi encontrada.')
  const [items] = await database.execute<Array<import('mysql2').RowDataPacket & { id: number }>>(
    'SELECT id FROM card_items WHERE card_id = ? AND item_order = ?',
    [cardId, itemIndex],
  )
  const itemId = items[0]?.id
  if (!itemId) throw new Error('O item da carta não existe na base de dados.')
  await database.execute(
    'INSERT INTO turn_items (turn_id, card_item_id, is_correct) VALUES (?, ?, ?)',
    [room.turnDatabaseId, itemId, correct],
  )
}

function scheduleBotTurn(room: OnlineRoom): void {
  if (!room.match || room.match.status !== 'playing' || room.match.turn?.role !== 'automated') return
  if (room.botTimer) clearTimeout(room.botTimer)
  const cardId = room.match.turn.card.id
  const teamIndex = room.match.currentTeamIndex
  const played = room.match.teamTurnsPlayed[room.match.turn.teamId] ?? 0
  room.botTimer = setTimeout(() => {
    void completeBotTurn(room, cardId, teamIndex, played).catch((error: unknown) => {
      console.error('Falha ao concluir a ronda automática dos bots:', error)
    })
  }, 2200)
}

async function completeBotTurn(room: OnlineRoom, cardId: string, teamIndex: number, played: number): Promise<void> {
  const current = room.match
  if (!current || current.status !== 'playing' || current.turn?.role !== 'automated' || current.turn.card.id !== cardId) return
  const score = 1 + ((cardId.length + teamIndex + played) % 4)
  const next = endAutomatedTurn(current, score)
  const turnId = room.turnDatabaseId
  if (!turnId) throw new Error('A ronda automática não tem registo persistente.')
  for (const [itemIndex, result] of current.turn.results.entries()) {
    const [items] = await database.execute<Array<import('mysql2').RowDataPacket & { id: number }>>(
      'SELECT id FROM card_items WHERE card_id = ? AND item_order = ?',
      [cardId, itemIndex],
    )
    const itemId = items[0]?.id
    if (!itemId) throw new Error(`O item ${itemIndex + 1} da carta "${cardId}" não existe.`)
    await database.execute(
      'INSERT INTO turn_items (turn_id, card_item_id, is_correct) VALUES (?, ?, ?)',
      [turnId, itemId, result === 'pending' && itemIndex < score],
    )
  }
  await database.execute('UPDATE match_turns SET ended_at = CURRENT_TIMESTAMP WHERE id = ?', [turnId])
  room.match = next
  await persistPositions(room)
  if (next.status === 'finished') {
    await finishMatch(room)
    publishMatch(room)
    publishRoom(room)
    return
  }
  const previousTurnId = room.turnDatabaseId
  broadcastPrivateTurn(room)
  await persistTurn(room, previousTurnId)
  publishMatch(room)
  scheduleBotTurn(room)
}

async function startNextTurn(room: OnlineRoom, previousTurnId?: string): Promise<void> {
  broadcastPrivateTurn(room)
  await persistTurn(room, previousTurnId)
  publishMatch(room)
  scheduleBotTurn(room)
}

function associateSocket(socket: AppSocket, room: OnlineRoom, member: RoomMember): void {
  closeMemberMedia(room.code, member.id)
  if (member.hostDisconnectTimer) clearTimeout(member.hostDisconnectTimer)
  member.hostDisconnectTimer = undefined
  member.socketId = socket.id
  member.isOnline = true
  socket.data.memberId = member.id
  socket.data.roomCode = room.code
  void socket.join(room.code)
}

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => roomAlphabet[randomInt(roomAlphabet.length)]).join('')
}

async function insertMember(room: OnlineRoom, name: string, avatar: string, teamId: number, isBot: boolean, isHost = false, socket?: AppSocket): Promise<RoomMember> {
  const id = randomUUID()
  await database.execute(
    'INSERT INTO players (id, display_name, avatar_id) VALUES (?, ?, ?)',
    [id, name, avatar],
  )
  await database.execute(
    'INSERT INTO room_members (id, room_id, player_id, team_id, role) VALUES (?, ?, ?, ?, ?)',
    [randomUUID(), room.id, id, teamId, isHost ? 'host' : isBot ? 'bot' : 'player'],
  )
  const member: RoomMember = {
    id,
    name,
    avatar,
    teamId,
    isBot,
    isHost,
    isOnline: Boolean(socket),
    socketId: socket?.id,
  }
  if (socket) {
    const token = randomUUID()
    member.sessionToken = token
    sessions.set(token, { roomCode: room.code, memberId: member.id })
    associateSocket(socket, room, member)
  }
  room.members.push(member)
  return member
}

async function createRoom(socket: AppSocket, rawPayload: unknown): Promise<AckPayload> {
  const payload = validate(createRoomSchema, rawPayload)
  const mediaSettings = payload.mediaSettings ?? {
    audioEnabled: true,
    videoEnabled: true,
    textChatEnabled: true,
    mimeEnabled: true,
  }
  const roomId = randomUUID()
  let code = createRoomCode()
  let availableCode = false
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [existing] = await database.execute<Array<import('mysql2').RowDataPacket & { id: string }>>(
      'SELECT id FROM rooms WHERE room_code = ?',
      [code],
    )
    if (!rooms.has(code) && existing.length === 0 && await claimRoomOwner(code)) {
      availableCode = true
      break
    }
    code = createRoomCode()
  }
  if (!availableCode) throw new ClientError('Não foi possível gerar um código de sala. Tenta novamente.')

  const room: OnlineRoom = {
    id: roomId,
    code,
    status: 'open',
    hostId: '',
    teamCount: payload.teamCount,
    mediaSettings,
    members: [],
    turnNumber: 0,
    closing: false,
    chatRate: new Map(),
    processing: false,
  }
  const hostId = randomUUID()
  const sessionToken = randomUUID()
  const connection = await database.getConnection().catch(async (error: unknown) => {
    await releaseRoomOwner(code).catch((releaseError: unknown) => {
      console.error('Falha ao libertar a reserva Redis da sala:', releaseError)
    })
    throw error
  })
  try {
    await connection.beginTransaction()
    await connection.execute(
      'INSERT INTO players (id, display_name, avatar_id) VALUES (?, ?, ?)',
      [hostId, payload.name, payload.avatar],
    )
    await connection.execute(
      `INSERT INTO rooms (id, room_code, host_player_id, team_count, allow_audio, allow_video, allow_text_chat, allow_mime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        room.id,
        room.code,
        hostId,
        room.teamCount,
        mediaSettings.audioEnabled,
        mediaSettings.videoEnabled,
        mediaSettings.textChatEnabled,
        mediaSettings.mimeEnabled,
      ],
    )
    await connection.execute(
      `INSERT INTO room_members (id, room_id, player_id, team_id, role)
       VALUES (?, ?, ?, ?, 'host')`,
      [randomUUID(), room.id, hostId, 1],
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    await releaseRoomOwner(code).catch((releaseError: unknown) => {
      console.error('Falha ao libertar a reserva Redis da sala:', releaseError)
    })
    throw error
  } finally {
    connection.release()
  }
  const host: RoomMember = {
    id: hostId,
    name: payload.name,
    avatar: payload.avatar,
    teamId: 1,
    isBot: false,
    isHost: true,
    isOnline: true,
    socketId: socket.id,
    sessionToken,
  }
  room.hostId = host.id
  room.members.push(host)
  sessions.set(sessionToken, { roomCode: room.code, memberId: host.id })
  associateSocket(socket, room, host)
  rooms.set(room.code, room)
  const result = {
    room: roomView(room),
    sessionToken,
    memberId: host.id,
    ...(getInstancePublicUrl() ? { serverUrl: getInstancePublicUrl() } : {}),
  }
  publishRoom(room)
  return result
}

async function joinRoom(socket: AppSocket, rawPayload: unknown): Promise<AckPayload> {
  const payload = validate(joinRoomSchema, rawPayload)
  let room = rooms.get(payload.code)
  if (!room && isRoomDirectoryEnabled()) {
    const owner = await findRoomOwner(payload.code)
    if (owner && owner.instanceId !== getInstanceId()) {
      if (owner.publicUrl !== getInstancePublicUrl()) {
        throw new RedirectError('A sala está noutra instância do servidor.', owner.publicUrl)
      }
      await closeStaleRoom(payload.code)
    } else if (!owner) {
      await closeStaleRoom(payload.code)
    }
    room = rooms.get(payload.code)
  }
  if (!room) throw new ClientError('Sala não encontrada ou já encerrada.')
  return withRoomLock(room, async () => {
    if (room.status !== 'open') throw new ClientError('Esta partida já começou ou foi encerrada.')
    const counts = Array.from({ length: room.teamCount }, (_, index) =>
      room.members.filter((member) => member.teamId === index + 1).length,
    )
    const smallestAvailableTeamSize = Math.min(...counts.filter((count) => count < 6))
    const teamIndex = counts.findIndex((count) => count === smallestAvailableTeamSize)
    if (teamIndex < 0) throw new ClientError('A sala está cheia.')
    const member = await insertMember(room, payload.name, payload.avatar, teamIndex + 1, false, false, socket)
    const view = roomView(room)
    publishRoom(room)
    return {
      room: view,
      sessionToken: member.sessionToken ?? '',
      memberId: member.id,
      ...(getInstancePublicUrl() ? { serverUrl: getInstancePublicUrl() } : {}),
    }
  })
}

async function closeStaleRoom(roomCode: string): Promise<void> {
  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.execute<Array<import('mysql2').RowDataPacket & { id: string }>>(
      "SELECT id FROM rooms WHERE room_code = ? AND status IN ('open', 'playing') FOR UPDATE",
      [roomCode],
    )
    const roomId = rows[0]?.id
    if (!roomId) {
      await connection.commit()
      return
    }
    await connection.execute(
      "UPDATE matches SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP WHERE room_id = ? AND status = 'playing'",
      [roomId],
    )
    await connection.execute(
      "UPDATE rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [roomId],
    )
    await connection.execute(
      'DELETE FROM players WHERE id IN (SELECT player_id FROM room_members WHERE room_id = ?)',
      [roomId],
    )
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function moveMember(socket: AppSocket, rawPayload: unknown): Promise<{ room: RoomStateView }> {
  const payload = validate(teamSchema, rawPayload)
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    if (room.status !== 'open') throw new ClientError('As equipas ficam bloqueadas quando a partida começa.')
    const actor = getMember(room, socket)
    const target = room.members.find((member) => member.id === payload.memberId)
    if (!target) throw new ClientError('Participante não encontrado.')
    if (!actor.isHost && actor.id !== target.id) throw new ClientError('Só o anfitrião pode alterar a equipa de outra pessoa.')
    if (payload.teamId > room.teamCount) throw new ClientError('Essa equipa não existe nesta sala.')
    if (target.teamId === payload.teamId) return { room: roomView(room) }
    const count = room.members.filter((member) => member.teamId === payload.teamId).length
    if (count >= 6) throw new ClientError('Essa equipa já tem seis participantes.')
    await database.execute('UPDATE room_members SET team_id = ? WHERE room_id = ? AND player_id = ?', [payload.teamId, room.id, target.id])
    target.teamId = payload.teamId
    publishRoom(room)
    return { room: roomView(room) }
  })
}

async function addBot(socket: AppSocket, rawPayload: unknown): Promise<{ room: RoomStateView }> {
  const payload = validate(addBotSchema, rawPayload)
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    const actor = getMember(room, socket)
    if (!actor.isHost) throw new ClientError('Só o anfitrião pode adicionar bots.')
    if (room.status !== 'open') throw new ClientError('Não podes alterar a sala depois do início.')
    if (payload.teamId > room.teamCount) throw new ClientError('Essa equipa não existe nesta sala.')
    if (room.members.filter((member) => member.teamId === payload.teamId).length >= 6) throw new ClientError('Essa equipa já tem seis participantes.')
    const name = botNames.find((candidate) => !room.members.some((member) => member.name === candidate)) ?? `Bot ${room.members.length + 1}`
    await insertMember(room, name, avatarOptions[room.members.length % avatarOptions.length].emoji, payload.teamId, true)
    publishRoom(room)
    return { room: roomView(room) }
  })
}

async function startOnlineMatch(socket: AppSocket): Promise<{ started: true }> {
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    const actor = getMember(room, socket)
    if (!actor.isHost) throw new ClientError('Só o anfitrião pode iniciar a partida.')
    if (room.status !== 'open') throw new ClientError('A partida já começou.')

    const teams = Array.from({ length: room.teamCount }, (_, index) => {
      const id = index + 1
      return {
        id,
        name: `Equipa ${id}`,
        color: teamColors[index],
        members: room.members.filter((member) => member.teamId === id).map(({ id: memberId, name, avatar, isBot }) => ({
          id: memberId, name, avatar, isBot,
        })),
      }
    })
    const invalidTeam = teams.find((team) => team.members.length < 2 || team.members.length > 6)
    if (invalidTeam) throw new ClientError(`${invalidTeam.name} precisa de ter entre 2 e 6 participantes.`)
    const cards = await loadPublishedCards()
    const match = startMatch(teams, cards)
    const firstTeam = currentTeam(match)
    const firstTurn = match.turn
    if (!firstTeam || !firstTurn) throw new Error('O motor não criou a primeira ronda.')

    const matchId = randomUUID()
    const teamDatabaseIds = new Map<number, string>()
    const turnDatabaseId = randomUUID()
    const firstGiver = firstTurn.role === 'human-gives'
      ? room.members.find((member) => member.teamId === firstTeam.id && !member.isBot)
      : undefined
    const connection = await database.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute(
        'INSERT INTO matches (id, room_id, mode, status) VALUES (?, ?, ?, ?)',
        [matchId, room.id, 'online', 'playing'],
      )
      for (const team of match.teams) {
        const teamDatabaseId = randomUUID()
        teamDatabaseIds.set(team.id, teamDatabaseId)
        await connection.execute(
          `INSERT INTO teams (id, match_id, team_number, name, color)
           VALUES (?, ?, ?, ?, ?)`,
          [teamDatabaseId, matchId, team.id, team.name, team.color],
        )
      }
      const firstTeamDatabaseId = teamDatabaseIds.get(firstTeam.id)
      if (!firstTeamDatabaseId) throw new Error('A primeira equipa não tem registo de base de dados.')
      await connection.execute("UPDATE rooms SET status = 'playing', started_at = CURRENT_TIMESTAMP WHERE id = ?", [room.id])
      await connection.execute(
        `INSERT INTO match_turns (id, match_id, team_id, player_id, card_id, turn_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [turnDatabaseId, matchId, firstTeamDatabaseId, firstGiver?.id ?? null, firstTurn.card.id, 1],
      )
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }

    room.match = match
    room.matchId = matchId
    room.teamDatabaseIds = teamDatabaseIds
    room.status = 'playing'
    room.turnDatabaseId = turnDatabaseId
    room.turnNumber = 1
    room.giverMemberId = firstGiver?.id
    broadcastPrivateTurn(room)
    publishRoom(room)
    publishMatch(room)
    room.timer = setInterval(() => {
      void tickRoom(room).catch((error: unknown) => console.error('Falha ao atualizar a ronda:', error))
    }, 1000)
    scheduleBotTurn(room)
    return { started: true }
  })
}

async function tickRoom(room: OnlineRoom): Promise<void> {
  if (room.processing) return
  room.processing = true
  try {
  const current = room.match
  if (!current || current.status !== 'playing') return
  const next = tickMatch(current)
  if (next === current) return
  room.match = next
  publishMatch(room)
  if (next.status === 'finished') {
    await finishMatch(room)
    publishMatch(room)
    publishRoom(room)
    return
  }
  if (next.turn !== current.turn) {
    const previousTurnId = room.turnDatabaseId
    await persistPositions(room)
    await startNextTurn(room, previousTurnId)
  }
  } finally {
    room.processing = false
  }
}

async function resolveOnlineItem(socket: AppSocket, rawPayload: unknown): Promise<{ resolved: true }> {
  const payload = validate(resolveSchema, rawPayload)
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    const member = getMember(room, socket)
    const match = room.match
    const turn = match?.turn
    const team = match ? currentTeam(match) : undefined
    if (!match || match.status !== 'playing' || !turn || !team) throw new ClientError('Não há uma ronda ativa.')
    if (turn.role === 'automated') throw new ClientError('Os bots ainda estão a jogar esta ronda.')
    if (member.isBot || member.teamId !== team.id) throw new ClientError('Só a equipa ativa pode responder.')
    if (turn.role === 'human-gives' && room.giverMemberId !== member.id) throw new ClientError('Só quem recebeu a carta pode confirmar o acerto.')

    const itemIndex = turn.itemIndex
    await persistResolvedItem(room, itemIndex, payload.correct)
    const next = resolveCurrentItem(match, payload.correct)
    room.match = next
    await persistPositions(room)
    if (next.status === 'finished') {
      await finishMatch(room)
      publishMatch(room)
      publishRoom(room)
      return { resolved: true }
    }
    if (next.turn !== turn) {
      await startNextTurn(room, room.turnDatabaseId)
    } else {
      broadcastPrivateTurn(room)
      publishMatch(room)
    }
    return { resolved: true }
  })
}

function attachSession(socket: AppSocket): void {
  const rawToken = socket.handshake.auth?.sessionToken
  if (typeof rawToken !== 'string') return
  const session = sessions.get(rawToken)
  const room = session ? rooms.get(session.roomCode) : undefined
  const member = room?.members.find((candidate) => candidate.id === session?.memberId)
  if (!room || !member || room.status === 'finished') {
    socket.emit('room:closed', { message: 'A sala já não está ativa. Cria uma nova sala ou entra novamente com um código válido.' })
    return
  }
  associateSocket(socket, room, member)
  publishRoom(room)
  if (room.match) {
    publishMatch(room)
    broadcastPrivateTurn(room)
  }
}

async function joinMedia(socket: AppSocket) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  if (!room.mediaSettings.audioEnabled && !room.mediaSettings.videoEnabled) {
    throw new ClientError('O anfitrião desativou o áudio e o vídeo nesta sala.')
  }
  const member = getMember(room, socket)
  return joinMediaRoom(room.code, member.id)
}

async function createTransport(
  socket: AppSocket,
  payload: { direction: 'send' | 'receive' },
) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  const member = getMember(room, socket)
  return createMediaTransport(room.code, member.id, payload.direction)
}

async function connectTransport(
  socket: AppSocket,
  payload: { transportId: string; dtlsParameters: import('mediasoup-client').types.DtlsParameters },
) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  const member = getMember(room, socket)
  await connectMediaTransport(room.code, member.id, payload.transportId, payload.dtlsParameters)
  return { connected: true as const }
}

async function publishMedia(
  socket: AppSocket,
  payload: {
    transportId: string
    kind: import('mediasoup-client').types.MediaKind
    rtpParameters: import('mediasoup-client').types.RtpParameters
  },
) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  const member = getMember(room, socket)
  if (payload.kind === 'audio' && !room.mediaSettings.audioEnabled) throw new ClientError('O anfitrião desativou o áudio nesta sala.')
  if (payload.kind === 'video' && !room.mediaSettings.videoEnabled) throw new ClientError('O anfitrião desativou o vídeo nesta sala.')
  return produceMedia(room.code, member.id, member.name, member.avatar, payload.transportId, payload.kind, payload.rtpParameters, (producer) => {
    io.to(room.code).emit('media:producer-closed', producer)
  }).then((result) => {
    const producer = {
      producerId: result.id,
      memberId: member.id,
      memberName: member.name,
      memberAvatar: member.avatar,
      kind: payload.kind,
    }
    io.to(room.code).emit('media:producer-added', producer)
    return result
  })
}

async function subscribeMedia(
  socket: AppSocket,
  payload: {
    transportId: string
    producerId: string
    rtpCapabilities: import('mediasoup-client').types.RtpCapabilities
  },
) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  const member = getMember(room, socket)
  return consumeMedia(room.code, member.id, payload.transportId, payload.producerId, payload.rtpCapabilities)
}

async function resumeConsumer(socket: AppSocket, payload: { consumerId: string }) {
  const room = getRoom(socket)
  if (room.status === 'finished') throw new ClientError('A sala já foi encerrada.')
  const member = getMember(room, socket)
  await resumeMediaConsumer(room.code, member.id, payload.consumerId)
  return { resumed: true as const }
}

function leaveMedia(socket: AppSocket): { left: true } {
  const room = getRoom(socket)
  const member = getMember(room, socket)
  closeMemberMedia(room.code, member.id)
  return { left: true }
}

function closeMediaProducer(socket: AppSocket, payload: { producerId: string }): { closed: true } {
  const room = getRoom(socket)
  const member = getMember(room, socket)
  closeMemberMediaProducer(room.code, member.id, payload.producerId)
  return { closed: true }
}

async function updateRoomSettings(
  socket: AppSocket,
  payload: Partial<RoomStateView['mediaSettings']>,
): Promise<{ room: RoomStateView }> {
  const settings = validate(roomSettingsSchema, payload)
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    const actor = getMember(room, socket)
    if (!actor.isHost) throw new ClientError('Só o anfitrião pode alterar as permissões da sala.')
    if (room.status !== 'open') throw new ClientError('As permissões ficam bloqueadas quando a partida começa.')
    const nextSettings = { ...room.mediaSettings, ...settings }
    await database.execute(
      `UPDATE rooms
          SET allow_audio = ?, allow_video = ?, allow_text_chat = ?, allow_mime = ?
        WHERE id = ?`,
      [nextSettings.audioEnabled, nextSettings.videoEnabled, nextSettings.textChatEnabled, nextSettings.mimeEnabled, room.id],
    )
    if (room.mediaSettings.audioEnabled && !nextSettings.audioEnabled) closeRoomMediaKind(room.code, 'audio')
    if (room.mediaSettings.videoEnabled && !nextSettings.videoEnabled) closeRoomMediaKind(room.code, 'video')
    room.mediaSettings = nextSettings
    publishRoom(room)
    return { room: roomView(room) }
  })
}

async function leaveRoom(socket: AppSocket): Promise<{ left: true }> {
  const room = getRoom(socket)
  return withRoomLock(room, async () => {
    const member = getMember(room, socket)
    if (member.isHost) {
      await closeRoom(room, 'O anfitrião encerrou a sala. A partida terminou e todos os jogadores foram retirados da sala.')
      socket.data.memberId = undefined
      socket.data.roomCode = undefined
      await socket.leave(room.code)
      return { left: true }
    }
    closeMemberMedia(room.code, member.id)
    member.socketId = undefined
    member.isOnline = false
    if (member.sessionToken) sessions.delete(member.sessionToken)
    member.sessionToken = undefined
    if (room.status === 'open' || (room.status === 'finished' && !room.match)) {
      room.members = room.members.filter((candidate) => candidate.id !== member.id)
      await database.execute('DELETE FROM players WHERE id = ?', [member.id])
    }
    socket.data.memberId = undefined
    socket.data.roomCode = undefined
    await socket.leave(room.code)
    publishRoom(room)
    return { left: true }
  })
}

async function closeRoom(room: OnlineRoom, message: string): Promise<void> {
  if (room.closing) return
  room.closing = true
  room.status = 'finished'
  if (room.timer) clearInterval(room.timer)
  if (room.botTimer) clearTimeout(room.botTimer)
  io.to(room.code).emit('room:closed', { message })

  const connection = await database.getConnection()
  try {
    await connection.beginTransaction()
    await connection.execute(
      "UPDATE matches SET status = 'abandoned', ended_at = CURRENT_TIMESTAMP WHERE room_id = ? AND status = 'playing'",
      [room.id],
    )
    await connection.execute(
      "UPDATE rooms SET status = 'closed', closed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [room.id],
    )
    for (const member of room.members) {
      await connection.execute('DELETE FROM players WHERE id = ?', [member.id])
    }
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    room.closing = false
    throw error
  } finally {
    connection.release()
  }

  closeRoomMedia(room.code)
  for (const member of room.members) {
    if (member.hostDisconnectTimer) clearTimeout(member.hostDisconnectTimer)
    if (member.sessionToken) sessions.delete(member.sessionToken)
    member.sessionToken = undefined
    member.socketId = undefined
    member.isOnline = false
  }
  const connectedSockets = await io.in(room.code).fetchSockets()
  await Promise.all(connectedSockets.map((connectedSocket) => connectedSocket.leave(room.code)))
  rooms.delete(room.code)
  await releaseRoomOwner(room.code).catch((error: unknown) => {
    console.error('Falha ao libertar a sala no Redis:', error)
  })
}

function sendChat(socket: AppSocket, rawPayload: unknown): { sent: true } {
  const payload = validate(chatSchema, rawPayload)
  const room = getRoom(socket)
  if (!room.mediaSettings.textChatEnabled) throw new ClientError('O anfitrião desativou o chat de texto nesta sala.')
  if (room.status === 'finished') throw new ClientError('O chat desta sala já foi encerrado.')
  const sender = getMember(room, socket)
  const now = Date.now()
  const recent = (room.chatRate.get(sender.id) ?? []).filter((sentAt) => now - sentAt < 10_000)
  if (recent.length >= 5) throw new ClientError('Estás a enviar mensagens demasiado depressa. Espera um momento.')
  recent.push(now)
  room.chatRate.set(sender.id, recent)
  const message: ChatMessageView = {
    id: randomUUID(),
    senderId: sender.id,
    senderName: sender.name,
    senderAvatar: sender.avatar,
    text: payload.text,
    sentAt: new Date(now).toISOString(),
  }
  io.to(room.code).emit('chat:message', message)
  return { sent: true }
}

io.on('connection', (socket) => {
  attachSession(socket)

  socket.on('room:create', (payload, ack) => withAck(ack, () => createRoom(socket, payload)))
  socket.on('room:join', (payload, ack) => withAck(ack, () => joinRoom(socket, payload)))
  socket.on('room:team', (payload, ack) => withAck(ack, () => moveMember(socket, payload)))
  socket.on('room:add-bot', (payload, ack) => withAck(ack, () => addBot(socket, payload)))
  socket.on('room:leave', (ack) => withAck(ack, () => leaveRoom(socket)))
  socket.on('match:start', (ack) => withAck(ack, () => startOnlineMatch(socket)))
  socket.on('match:resolve', (payload, ack) => withAck(ack, () => resolveOnlineItem(socket, payload)))
  socket.on('chat:send', (payload, ack) => withAck(ack, async () => sendChat(socket, payload)))
  socket.on('media:join', (ack) => withAck(ack, () => joinMedia(socket)))
  socket.on('media:create-transport', (payload, ack) => withAck(ack, async () => createTransport(socket, validate(transportSchema, payload))))
  socket.on('media:connect-transport', (payload, ack) => withAck(ack, async () => connectTransport(socket, validate(connectTransportSchema, payload))))
  socket.on('media:produce', (payload, ack) => withAck(ack, async () => publishMedia(socket, validate(produceSchema, payload))))
  socket.on('media:consume', (payload, ack) => withAck(ack, async () => subscribeMedia(socket, validate(consumeSchema, payload))))
  socket.on('media:resume-consumer', (payload, ack) => withAck(ack, async () => resumeConsumer(socket, validate(resumeConsumerSchema, payload))))
  socket.on('media:leave', (ack) => withAck(ack, async () => leaveMedia(socket)))
  socket.on('media:close-producer', (payload, ack) => withAck(ack, async () => closeMediaProducer(socket, validate(closeProducerSchema, payload))))
  socket.on('room:settings', (payload, ack) => withAck(ack, () => updateRoomSettings(socket, payload)))
  socket.on('disconnect', () => {
    void disconnectSocket(socket).catch((error: unknown) => console.error('Falha ao atualizar uma desconexão:', error))
  })
})

async function disconnectSocket(socket: AppSocket): Promise<void> {
  const room = socket.data.roomCode ? rooms.get(socket.data.roomCode) : undefined
  const member = room?.members.find((candidate) => candidate.id === socket.data.memberId)
  if (!room || !member || member.socketId !== socket.id) return
  closeMemberMedia(room.code, member.id)
  member.isOnline = false
  member.socketId = undefined
  if (member.isHost) {
    member.hostDisconnectTimer = setTimeout(() => {
      if (member.isOnline || room.status === 'finished') return
      void closeRoom(room, 'A sala foi encerrada porque o anfitrião não voltou a ligar-se.').catch((error: unknown) => {
        console.error('Falha ao encerrar a sala após a desconexão do anfitrião:', error)
      })
    }, config.HOST_RECONNECT_GRACE_MS)
  }
  publishRoom(room)
}

async function main(): Promise<void> {
  await initializeDatabase()
  await initializeRoomDirectory(io)
  await initializeMediaWorker()
  httpServer.listen(config.PORT, () => {
    console.info(`MAXAKA server ativo na porta ${config.PORT}.`)
  })
  const shutdown = async (): Promise<void> => {
    for (const room of [...rooms.values()]) {
      if (room.timer) clearInterval(room.timer)
      if (room.botTimer) clearTimeout(room.botTimer)
      for (const member of room.members) {
        if (member.hostDisconnectTimer) clearTimeout(member.hostDisconnectTimer)
      }
      await closeRoom(room, 'O servidor foi reiniciado. Cria uma nova sala para continuar a jogar.')
    }
    io.close()
    await closeMediaWorker()
    await closeRoomDirectory()
    await closeDatabase()
  }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })
}

void main().catch(async (error: unknown) => {
  console.error('O servidor MAXAKA não conseguiu iniciar:', error)
  await closeRoomDirectory()
  await closeDatabase()
  process.exitCode = 1
})
