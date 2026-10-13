import * as mediasoup from 'mediasoup'
import { createHmac } from 'node:crypto'
import type { types as MediaTypes } from 'mediasoup'
import { config } from './config.ts'

type MediaProducer = {
  memberId: string
  memberName: string
  memberAvatar: string
  producer: MediaTypes.Producer
}

type RoomMedia = {
  router: MediaTypes.Router
  joinedMembers: Set<string>
  transports: Map<string, { memberId: string; direction: 'send' | 'receive'; transport: MediaTypes.WebRtcTransport }>
  producers: Map<string, MediaProducer>
  consumers: Map<string, { memberId: string; consumer: MediaTypes.Consumer }>
}

export type MediaProducerView = {
  producerId: string
  memberId: string
  memberName: string
  memberAvatar: string
  kind: MediaTypes.MediaKind
}

export type MediaTransportView = {
  id: string
  iceParameters: MediaTypes.IceParameters
  iceCandidates: MediaTypes.IceCandidate[]
  dtlsParameters: MediaTypes.DtlsParameters
}

export type MediaConsumerView = {
  id: string
  producerId: string
  kind: MediaTypes.MediaKind
  rtpParameters: MediaTypes.RtpParameters
}

export type MediaIceServerView = {
  urls: string[]
  username?: string
  credential?: string
  credentialType?: 'password'
}

let worker: MediaTypes.Worker | undefined
const roomMedia = new Map<string, RoomMedia>()
const pendingRouters = new Map<string, Promise<RoomMedia>>()
const closedRooms = new Set<string>()

const mediaCodecs: MediaTypes.RouterRtpCodecCapability[] = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48_000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90_000 },
]

export async function initializeMediaWorker(): Promise<void> {
  if (worker) return
  worker = await mediasoup.createWorker({
    rtcMinPort: config.MEDIA_RTC_MIN_PORT,
    rtcMaxPort: config.MEDIA_RTC_MAX_PORT,
    logLevel: 'warn',
  })
  worker.on('died', (error) => {
    console.error('O worker mediasoup terminou inesperadamente:', error)
    process.exitCode = 1
    setTimeout(() => process.exit(1), 1000).unref()
  })
  console.info(`Worker mediasoup ativo; portas RTP ${config.MEDIA_RTC_MIN_PORT}-${config.MEDIA_RTC_MAX_PORT}.`)
}

async function getRoomMedia(roomCode: string): Promise<RoomMedia> {
  if (closedRooms.has(roomCode)) throw new Error('A sala já foi encerrada.')
  const existing = roomMedia.get(roomCode)
  if (existing) return existing

  let pending = pendingRouters.get(roomCode)
  if (!pending) {
    if (!worker) throw new Error('O worker de mídia ainda não foi iniciado.')
    pending = worker.createRouter({ mediaCodecs }).then((router) => {
      if (closedRooms.has(roomCode)) {
        router.close()
        throw new Error('A sala foi encerrada durante a criação da chamada.')
      }
      const state: RoomMedia = {
        router,
        joinedMembers: new Set(),
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      }
      roomMedia.set(roomCode, state)
      pendingRouters.delete(roomCode)
      router.observer.on('close', () => roomMedia.delete(roomCode))
      return state
    }).catch((error: unknown) => {
      pendingRouters.delete(roomCode)
      throw error
    })
    pendingRouters.set(roomCode, pending)
  }
  return pending
}

export async function joinMediaRoom(roomCode: string, memberId: string): Promise<{
  routerRtpCapabilities: MediaTypes.RtpCapabilities
  producers: MediaProducerView[]
  iceServers: MediaIceServerView[]
}> {
  const state = await getRoomMedia(roomCode)
  state.joinedMembers.add(memberId)
  return {
    routerRtpCapabilities: state.router.rtpCapabilities,
    producers: [...state.producers.entries()]
      .filter(([, producer]) => producer.memberId !== memberId && !producer.producer.closed)
      .map(([producerId, producer]) => ({
        producerId,
        memberId: producer.memberId,
        memberName: producer.memberName,
        memberAvatar: producer.memberAvatar,
        kind: producer.producer.kind,
      })),
    iceServers: createTurnIceServers(config.MEDIA_TURN_URLS, config.MEDIA_TURN_SHARED_SECRET),
  }
}

export function createTurnIceServers(urls: string, sharedSecret: string, now = Date.now()): MediaIceServerView[] {
  const turnUrls = urls.split(',').map((url) => url.trim()).filter(Boolean)
  if (turnUrls.length === 0) return []
  if (!sharedSecret) throw new Error('O segredo partilhado TURN é obrigatório quando existem URLs TURN.')

  const username = `${Math.floor(now / 1000) + 7200}:maxaka`
  const credential = createHmac('sha1', sharedSecret).update(username).digest('base64')
  return [{ urls: turnUrls, username, credential, credentialType: 'password' }]
}

export async function createMediaTransport(
  roomCode: string,
  memberId: string,
  direction: 'send' | 'receive',
): Promise<MediaTransportView> {
  const state = await getRoomMedia(roomCode)
  if (!state.joinedMembers.has(memberId)) throw new Error('Entra na chamada antes de criar um transporte.')
  if ([...state.transports.values()].filter((entry) => entry.memberId === memberId).length >= 2) {
    throw new Error('Já existem transportes ativos para este participante.')
  }
  const transport = await state.router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: 'udp',
        ip: config.MEDIA_LISTEN_IP,
        announcedAddress: config.MEDIA_ANNOUNCED_ADDRESS,
        portRange: { min: config.MEDIA_RTC_MIN_PORT, max: config.MEDIA_RTC_MAX_PORT },
      },
      {
        protocol: 'tcp',
        ip: config.MEDIA_LISTEN_IP,
        announcedAddress: config.MEDIA_ANNOUNCED_ADDRESS,
        portRange: { min: config.MEDIA_RTC_MIN_PORT, max: config.MEDIA_RTC_MAX_PORT },
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
    appData: { memberId },
  })
  state.transports.set(transport.id, { memberId, direction, transport })
  transport.observer.on('close', () => state.transports.delete(transport.id))
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  }
}

export async function connectMediaTransport(
  roomCode: string,
  memberId: string,
  transportId: string,
  dtlsParameters: MediaTypes.DtlsParameters,
): Promise<void> {
  const state = await getRoomMedia(roomCode)
  if (!state.joinedMembers.has(memberId)) throw new Error('Entra na chamada antes de ligar o transporte.')
  const entry = state.transports.get(transportId)
  if (!entry || entry.memberId !== memberId) throw new Error('Transporte de mídia não encontrado.')
  await entry.transport.connect({ dtlsParameters })
}

export async function produceMedia(
  roomCode: string,
  memberId: string,
  memberName: string,
  memberAvatar: string,
  transportId: string,
  kind: MediaTypes.MediaKind,
  rtpParameters: MediaTypes.RtpParameters,
  onProducer: (producer: MediaProducerView) => void,
): Promise<{ id: string }> {
  const state = await getRoomMedia(roomCode)
  if (!state.joinedMembers.has(memberId)) throw new Error('Entra na chamada antes de enviar mídia.')
  const entry = state.transports.get(transportId)
  if (!entry || entry.memberId !== memberId || entry.direction !== 'send') throw new Error('Transporte de envio não encontrado.')
  if (state.producers.size >= 60) throw new Error('A sala atingiu o limite de fontes de áudio e vídeo.')
  if ([...state.producers.values()].some((producer) => producer.memberId === memberId && producer.producer.kind === kind)) {
    throw new Error('Já existe uma fonte ativa para este tipo de mídia.')
  }
  const producer = await entry.transport.produce({ kind, rtpParameters })
  const producerData = { memberId, memberName, memberAvatar, producer }
  state.producers.set(producer.id, producerData)
  const view = {
    producerId: producer.id,
    memberId,
    memberName,
    memberAvatar,
    kind: producer.kind,
  }
  producer.observer.on('close', () => {
    state.producers.delete(producer.id)
    onProducer(view)
  })
  return { id: producer.id }
}

export async function consumeMedia(
  roomCode: string,
  memberId: string,
  transportId: string,
  producerId: string,
  rtpCapabilities: MediaTypes.RtpCapabilities,
): Promise<MediaConsumerView> {
  const state = await getRoomMedia(roomCode)
  if (!state.joinedMembers.has(memberId)) throw new Error('Entra na chamada antes de receber mídia.')
  const transport = state.transports.get(transportId)
  const producer = state.producers.get(producerId)
  if (!transport || transport.memberId !== memberId || transport.direction !== 'receive') throw new Error('Transporte de receção não encontrado.')
  if (!producer || producer.memberId === memberId || producer.producer.closed) throw new Error('Fonte de mídia não encontrada.')
  if (!state.router.canConsume({ producerId, rtpCapabilities })) throw new Error('Este dispositivo não suporta esta fonte de mídia.')

  const consumer = await transport.transport.consume({
    producerId,
    rtpCapabilities,
    paused: true,
  })
  state.consumers.set(consumer.id, { memberId, consumer })
  consumer.observer.on('close', () => state.consumers.delete(consumer.id))
  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  }
}

export async function resumeMediaConsumer(roomCode: string, memberId: string, consumerId: string): Promise<void> {
  const state = await getRoomMedia(roomCode)
  const entry = state.consumers.get(consumerId)
  if (!entry || entry.memberId !== memberId) throw new Error('Recetor de mídia não encontrado.')
  await entry.consumer.resume()
}

export function closeMemberMedia(roomCode: string, memberId: string): void {
  const state = roomMedia.get(roomCode)
  if (!state) return
  state.joinedMembers.delete(memberId)
  for (const entry of state.producers.values()) {
    if (entry.memberId === memberId) entry.producer.close()
  }
  for (const entry of state.consumers.values()) {
    if (entry.memberId === memberId) entry.consumer.close()
  }
  for (const entry of state.transports.values()) {
    if (entry.memberId === memberId) entry.transport.close()
  }
}

export function closeRoomMediaKind(roomCode: string, kind: MediaTypes.MediaKind): void {
  const state = roomMedia.get(roomCode)
  if (!state) return
  for (const entry of state.producers.values()) {
    if (entry.producer.kind === kind) entry.producer.close()
  }
}

export function closeMemberMediaProducer(roomCode: string, memberId: string, producerId: string): void {
  const state = roomMedia.get(roomCode)
  const entry = state?.producers.get(producerId)
  if (!entry) return
  if (entry.memberId !== memberId) throw new Error('Fonte de mídia não encontrada.')
  entry.producer.close()
}

export function closeRoomMedia(roomCode: string): void {
  closedRooms.add(roomCode)
  const state = roomMedia.get(roomCode)
  if (!state) return
  state.router.close()
  roomMedia.delete(roomCode)
}

export async function closeMediaWorker(): Promise<void> {
  for (const state of roomMedia.values()) state.router.close()
  roomMedia.clear()
  pendingRouters.clear()
  closedRooms.clear()
  if (worker && !worker.closed) await worker.close()
  worker = undefined
}
