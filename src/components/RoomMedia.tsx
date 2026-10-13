import { useCallback, useEffect, useRef, useState } from 'react'
import { Device, type types as MediaTypes } from 'mediasoup-client'
import type { Socket } from 'socket.io-client'
import type {
  AckResult,
  ClientToServerEvents,
  MediaConsumerView,
  MediaProducerView,
  MediaTransportView,
  ServerToClientEvents,
} from '../realtime/protocol.ts'

type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>
type MediaKind = 'audio' | 'video'

type RemoteParticipant = {
  memberId: string
  name: string
  avatar: string
  stream: MediaStream
  hasVideo: boolean
}

type MediaResources = {
  device: Device
  sendTransport: MediaTypes.Transport
  receiveTransport: MediaTypes.Transport
  producers: Map<MediaKind, MediaTypes.Producer>
  consumers: Map<string, MediaTypes.Consumer>
  localStream: MediaStream
}

type RoomMediaProps = {
  socket: RealtimeSocket
  memberId: string
  avatar: string
  isHost: boolean
  roomStatus: 'open' | 'playing' | 'finished'
  settings: {
    audioEnabled: boolean
    videoEnabled: boolean
    textChatEnabled: boolean
    mimeEnabled: boolean
  }
}

function request<T>(emit: (ack: (error: Error | null, result: AckResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    emit((error, result) => {
      if (error) {
        reject(error)
      } else if (result.ok) {
        resolve(result.data)
      } else {
        reject(new Error(result.error))
      }
    })
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('O transporte de mídia falhou.')
}

function MediaTile({ participant, local = false }: { participant: RemoteParticipant; local?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [voiceActive, setVoiceActive] = useState(false)
  const hasAudio = participant.stream.getAudioTracks().length > 0

  useEffect(() => {
    const videoElement = videoRef.current
    if (videoElement) videoElement.srcObject = participant.stream
    return () => {
      if (videoElement) videoElement.srcObject = null
    }
  }, [participant.stream])

  useEffect(() => {
    if (local || !hasAudio) return
    if (!('AudioContext' in window)) return

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    audioContext.createMediaStreamSource(participant.stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    let previousVoiceState = false
    const detectVoice = () => {
      analyser.getByteTimeDomainData(samples)
      const power = samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length
      const active = Math.sqrt(power) > 0.035
      if (active !== previousVoiceState) {
        previousVoiceState = active
        setVoiceActive(active)
      }
      frame = window.requestAnimationFrame(detectVoice)
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch((error: unknown) => console.error('Não foi possível iniciar o indicador de voz:', error))
    }
    frame = window.requestAnimationFrame(detectVoice)

    return () => {
      window.cancelAnimationFrame(frame)
      void audioContext.close()
    }
  }, [hasAudio, local, participant.stream])

  return (
    <article className={`media-tile ${local ? 'media-tile-local' : ''}`}>
      <span className="media-tile-avatar" aria-hidden="true">{participant.avatar}</span>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={local}
        className={participant.hasVideo ? 'media-video-visible' : 'media-video-hidden'}
        aria-label={local ? 'Pré-visualização da tua câmara' : `Vídeo de ${participant.name}`}
      />
      {!local && hasAudio && (
        <span className={`media-voice-indicator ${voiceActive ? 'media-voice-active' : ''}`} aria-live="polite">
          {voiceActive ? 'A falar' : 'Áudio ligado'}
        </span>
      )}
      <strong>{participant.name}{local ? ' · Tu' : ''}</strong>
    </article>
  )
}

export default function RoomMedia({ socket, memberId, avatar, isHost, roomStatus, settings }: RoomMediaProps) {
  const resourcesRef = useRef<MediaResources | null>(null)
  const remoteParticipantsRef = useRef(new Map<string, RemoteParticipant>())
  const knownProducersRef = useRef(new Map<string, MediaProducerView>())
  const pendingConsumersRef = useRef(new Set<string>())
  const pendingKindsRef = useRef(new Set<MediaKind>())
  const [callActive, setCallActive] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [enabledKinds, setEnabledKinds] = useState<Record<MediaKind, boolean>>({ audio: false, video: false })
  const [pendingKinds, setPendingKinds] = useState<Record<MediaKind, boolean>>({ audio: false, video: false })
  const [participants, setParticipants] = useState<RemoteParticipant[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const busyRef = useRef(false)
  const shouldReconnectRef = useRef(false)

  function refreshParticipants(): void {
    setParticipants([...remoteParticipantsRef.current.values()])
  }

  const removeProducer = useCallback((producerId: string): void => {
    const participant = remoteParticipantsRef.current.get(knownProducersRef.current.get(producerId)?.memberId ?? '')
    knownProducersRef.current.delete(producerId)
    pendingConsumersRef.current.delete(producerId)
    const consumer = resourcesRef.current?.consumers.get(producerId)
    if (consumer) {
      consumer.close()
      resourcesRef.current?.consumers.delete(producerId)
    }
    if (participant && consumer) {
      participant.stream.removeTrack(consumer.track)
      participant.hasVideo = participant.stream.getVideoTracks().length > 0
      if (participant.stream.getTracks().length === 0) remoteParticipantsRef.current.delete(participant.memberId)
      refreshParticipants()
    }
  }, [])

  const consumeProducer = useCallback(async (producerInfo: MediaProducerView): Promise<void> => {
    const resources = resourcesRef.current
    if (!resources || producerInfo.memberId === memberId || resources.consumers.has(producerInfo.producerId) || pendingConsumersRef.current.has(producerInfo.producerId)) return
    pendingConsumersRef.current.add(producerInfo.producerId)
    try {
      const parameters = await request<MediaConsumerView>((ack) => socket.timeout(8000).emit(
        'media:consume',
        { transportId: resources.receiveTransport.id, producerId: producerInfo.producerId, rtpCapabilities: resources.device.recvRtpCapabilities },
        ack,
      ))
      const consumer = await resources.receiveTransport.consume(parameters)
      resources.consumers.set(producerInfo.producerId, consumer)
      const participant = remoteParticipantsRef.current.get(producerInfo.memberId) ?? {
        memberId: producerInfo.memberId,
        name: producerInfo.memberName,
        avatar: producerInfo.memberAvatar,
        stream: new MediaStream(),
        hasVideo: false,
      }
      participant.stream.addTrack(consumer.track)
      participant.hasVideo = participant.stream.getVideoTracks().length > 0
      remoteParticipantsRef.current.set(participant.memberId, participant)
      consumer.on('transportclose', () => removeProducer(producerInfo.producerId))
      await request<{ resumed: true }>((ack) => socket.timeout(8000).emit('media:resume-consumer', { consumerId: consumer.id }, ack))
      refreshParticipants()
    } catch (error) {
      setNotice(`Não foi possível receber a mídia de ${producerInfo.memberName}: ${toError(error).message}`)
    } finally {
      pendingConsumersRef.current.delete(producerInfo.producerId)
    }
  }, [memberId, removeProducer, socket])

  const initializeCall = useCallback(async (): Promise<void> => {
    if (resourcesRef.current || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setNotice('')
    try {
      const mediaRoom = await request<{ routerRtpCapabilities: MediaTypes.RtpCapabilities; producers: MediaProducerView[]; iceServers: RTCIceServer[] }>(
        (ack) => socket.timeout(8000).emit('media:join', ack),
      )
      knownProducersRef.current.clear()
      for (const producer of mediaRoom.producers) knownProducersRef.current.set(producer.producerId, producer)
      const device = new Device()
      await device.load({ routerRtpCapabilities: mediaRoom.routerRtpCapabilities })
      const sendParameters = await request<MediaTransportView>((ack) => socket.timeout(8000).emit('media:create-transport', { direction: 'send' }, ack))
      const receiveParameters = await request<MediaTransportView>((ack) => socket.timeout(8000).emit('media:create-transport', { direction: 'receive' }, ack))
      const sendTransport = device.createSendTransport({ ...sendParameters, iceServers: mediaRoom.iceServers })
      const receiveTransport = device.createRecvTransport({ ...receiveParameters, iceServers: mediaRoom.iceServers })

      for (const transport of [sendTransport, receiveTransport]) {
        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
          void request<{ connected: true }>((ack) => socket.timeout(8000).emit(
            'media:connect-transport',
            { transportId: transport.id, dtlsParameters },
            ack,
          )).then(callback, (error: unknown) => errback(toError(error)))
        })
        transport.on('connectionstatechange', (state) => {
          if (state === 'failed') setNotice('A ligação de mídia falhou. Sai da chamada e tenta entrar novamente.')
        })
      }
      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        void request<{ id: string }>((ack) => socket.timeout(8000).emit(
          'media:produce',
          { transportId: sendTransport.id, kind, rtpParameters },
          ack,
        )).then(callback, (error: unknown) => errback(toError(error)))
      })

      const resources = {
        device,
        sendTransport,
        receiveTransport,
        producers: new Map<MediaKind, MediaTypes.Producer>(),
        consumers: new Map<string, MediaTypes.Consumer>(),
        localStream: new MediaStream(),
      }
      resourcesRef.current = resources
      shouldReconnectRef.current = true
      setLocalStream(resources.localStream)
      setCallActive(true)
      for (const producer of knownProducersRef.current.values()) void consumeProducer(producer)
    } catch (error) {
      let cleanupMessage = ''
      try {
        await request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack))
      } catch (cleanupError) {
        cleanupMessage = ` A limpeza no servidor também falhou: ${toError(cleanupError).message}`
      }
      setNotice(`Não foi possível entrar na chamada: ${toError(error).message}.${cleanupMessage}`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [consumeProducer, socket])

  async function toggleKind(kind: MediaKind): Promise<void> {
    const resources = resourcesRef.current
    if (!resources || pendingKindsRef.current.has(kind)) return

    if (enabledKinds[kind]) {
      const existingProducer = resources.producers.get(kind)
      if (!existingProducer) return
      const track = existingProducer.track
      existingProducer.close()
      resources.producers.delete(kind)
      if (track) {
        resources.localStream.removeTrack(track)
        track.stop()
      }
      setLocalStream(resources.localStream)
      setEnabledKinds((current) => ({ ...current, [kind]: false }))
      try {
        await request<{ closed: true }>((ack) => socket.timeout(5000).emit('media:close-producer', { producerId: existingProducer.id }, ack))
      } catch (error) {
        setNotice(`A faixa local foi desligada, mas o servidor não confirmou a alteração: ${toError(error).message}`)
      }
      return
    }

    pendingKindsRef.current.add(kind)
    setPendingKinds((current) => ({ ...current, [kind]: true }))
    setNotice('')
    let acquiredStream: MediaStream | undefined

    try {
      const currentResources = resourcesRef.current
      if (!currentResources) throw new Error('A chamada terminou antes da ativação do dispositivo.')
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador não suporta câmara e microfone neste endereço. Usa um dispositivo compatível e HTTPS.')
      }
      acquiredStream = await navigator.mediaDevices.getUserMedia({
        audio: kind === 'audio',
        video: kind === 'video',
      })
      const track = kind === 'audio' ? acquiredStream.getAudioTracks()[0] : acquiredStream.getVideoTracks()[0]
      if (!track) throw new Error(kind === 'audio' ? 'Não foi encontrada uma faixa de microfone.' : 'Não foi encontrada uma faixa de câmara.')
      const producer = await currentResources.sendTransport.produce({ track })
      currentResources.producers.set(kind, producer)
      currentResources.localStream.addTrack(track)
      setLocalStream(currentResources.localStream)
      setEnabledKinds((current) => ({ ...current, [kind]: true }))
    } catch (error) {
      acquiredStream?.getTracks().forEach((track) => track.stop())
      const mediaError = toError(error)
      const reason = mediaError.name === 'NotAllowedError'
        ? 'A autorização foi recusada no navegador.'
        : mediaError.name === 'NotFoundError'
          ? 'Não foi encontrado um dispositivo compatível.'
          : mediaError.message
      setNotice(`Não foi possível ativar ${kind === 'audio' ? 'o microfone' : 'a câmara'}: ${reason}`)
    } finally {
      pendingKindsRef.current.delete(kind)
      setPendingKinds((current) => ({ ...current, [kind]: false }))
    }
  }

  async function leaveCall(): Promise<void> {
    shouldReconnectRef.current = false
    const resources = resourcesRef.current
    resourcesRef.current = null
    resources?.consumers.forEach((consumer) => consumer.close())
    resources?.producers.forEach((producer) => producer.close())
    resources?.sendTransport.close()
    resources?.receiveTransport.close()
    resources?.localStream.getTracks().forEach((track) => track.stop())
    remoteParticipantsRef.current.clear()
    knownProducersRef.current.clear()
    pendingConsumersRef.current.clear()
    setParticipants([])
    setLocalStream(null)
    setEnabledKinds({ audio: false, video: false })
    setCallActive(false)
    setNotice('')
    try {
      await request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack))
    } catch (error) {
      setNotice(`A chamada foi desligada neste dispositivo, mas o servidor não confirmou a saída: ${toError(error).message}`)
    }
  }

  async function toggleRoomSetting(setting: keyof RoomMediaProps['settings']): Promise<void> {
    try {
      await request<{ room: { mediaSettings: RoomMediaProps['settings'] } }>((ack) => socket.timeout(5000).emit(
        'room:settings',
        { [setting]: !settings[setting] },
        ack,
      ))
      setNotice('')
    } catch (error) {
      setNotice(`Não foi possível alterar esta permissão: ${toError(error).message}`)
    }
  }

  useEffect(() => {
    const onProducerAdded = (producer: MediaProducerView) => {
      knownProducersRef.current.set(producer.producerId, producer)
      void consumeProducer(producer)
    }
    const onProducerClosed = (producer: MediaProducerView) => {
      if (producer.memberId === memberId) {
        const resources = resourcesRef.current
        const kind = producer.kind
        const localProducer = resources?.producers.get(kind)
        if (localProducer?.id === producer.producerId) {
          const track = localProducer.track
          localProducer.close()
          resources?.producers.delete(kind)
          if (track) {
            resources?.localStream.removeTrack(track)
            track.stop()
          }
          if (resources) setLocalStream(resources.localStream)
          setEnabledKinds((current) => ({ ...current, [kind]: false }))
        }
      } else {
        removeProducer(producer.producerId)
      }
    }
    const onDisconnect = () => {
      const resources = resourcesRef.current
      shouldReconnectRef.current = Boolean(resources)
      resourcesRef.current = null
      resources?.consumers.forEach((consumer) => consumer.close())
      resources?.producers.forEach((producer) => producer.close())
      resources?.sendTransport.close()
      resources?.receiveTransport.close()
      resources?.localStream.getTracks().forEach((track) => track.stop())
      remoteParticipantsRef.current.clear()
      knownProducersRef.current.clear()
      pendingConsumersRef.current.clear()
      setParticipants([])
      setLocalStream(null)
      setEnabledKinds({ audio: false, video: false })
      setCallActive(false)
      setNotice('A ligação à sala foi perdida; a chamada foi desligada.')
    }
    const onConnect = () => {
      if (!shouldReconnectRef.current) return
      shouldReconnectRef.current = false
      void initializeCall()
    }
    socket.on('media:producer-added', onProducerAdded)
    socket.on('media:producer-closed', onProducerClosed)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', onConnect)
    return () => {
      socket.off('media:producer-added', onProducerAdded)
      socket.off('media:producer-closed', onProducerClosed)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', onConnect)
      const resources = resourcesRef.current
      resourcesRef.current = null
      resources?.consumers.forEach((consumer) => consumer.close())
      resources?.producers.forEach((producer) => producer.close())
      resources?.sendTransport.close()
      resources?.receiveTransport.close()
      resources?.localStream.getTracks().forEach((track) => track.stop())
      if (resources && socket.connected) {
        void request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack)).catch((error: unknown) => {
          console.error('Não foi possível confirmar a saída da chamada:', error)
        })
      }
    }
  }, [socket, memberId, consumeProducer, initializeCall, removeProducer])

  useEffect(() => {
    const resources = resourcesRef.current
    if (!resources) return
    for (const kind of ['audio', 'video'] as const) {
      const enabled = kind === 'audio' ? settings.audioEnabled : settings.videoEnabled
      const producer = resources.producers.get(kind)
      if (enabled || !producer) continue
      const producerId = producer.id
      producer.close()
      resources.producers.delete(kind)
      const track = producer.track
      if (track) {
        resources.localStream.removeTrack(track)
        track.stop()
      }
      void request<{ closed: true }>((ack) => socket.timeout(3000).emit('media:close-producer', { producerId }, ack)).catch((error: unknown) => {
        console.error('Não foi possível confirmar o fim da fonte de mídia:', error)
      })
      setEnabledKinds((current) => ({ ...current, [kind]: false }))
      setLocalStream(resources.localStream)
    }
  }, [removeProducer, settings.audioEnabled, settings.videoEnabled, socket])

  return (
    <section className="room-media-panel" aria-label="Áudio e vídeo da sala">
      <div className="room-media-heading">
        <div>
          <span className="eyebrow">CHAMADA DA SALA</span>
          <strong>{callActive ? 'Ligado à chamada' : 'Áudio e vídeo opcionais'}</strong>
        </div>
        {callActive ? (
          <button className="button button-secondary" type="button" onClick={() => void leaveCall()}>Sair da chamada</button>
        ) : (
          <button className="button button-primary" type="button" disabled={busy || !socket.connected || (!settings.audioEnabled && !settings.videoEnabled)} onClick={() => void initializeCall()}>
            {busy ? 'A ligar…' : 'Entrar na chamada'}
          </button>
        )}
      </div>
      <div className="room-media-policy">
        {([
          ['audioEnabled', 'Áudio'],
          ['videoEnabled', 'Vídeo'],
          ['textChatEnabled', 'Chat'],
          ['mimeEnabled', 'Mímica'],
        ] as const).map(([setting, label]) => (
          <span className={`media-policy-chip ${settings[setting] ? 'media-policy-enabled' : ''}`} key={setting}>
            {label}: {settings[setting] ? 'permitido' : 'desativado'}
            {isHost && roomStatus === 'open' && (
              <button type="button" onClick={() => void toggleRoomSetting(setting)} aria-label={`Alterar permissão: ${label}`}>
                Alterar
              </button>
            )}
          </span>
        ))}
      </div>
      {callActive && (
        <>
          <div className="room-media-collapse">
            <button type="button" className="media-control" aria-expanded={!minimized} onClick={() => setMinimized((current) => !current)}>
              {minimized ? 'Expandir área da chamada' : 'Minimizar área da chamada'}
            </button>
          </div>
          {!minimized && (
            <>
          <div className="room-media-controls">
            {(['audio', 'video'] as const).map((kind) => (
              <button
                className={`media-control ${enabledKinds[kind] ? 'media-control-active' : ''}`}
                type="button"
                key={kind}
                disabled={pendingKinds[kind] || (kind === 'audio' ? !settings.audioEnabled : !settings.videoEnabled)}
                aria-pressed={enabledKinds[kind]}
                onClick={() => void toggleKind(kind)}
              >
                {pendingKinds[kind] ? 'A ativar…' : enabledKinds[kind] ? (kind === 'audio' ? 'Microfone ligado' : 'Câmara ligada') : (kind === 'audio' ? 'Ligar microfone' : 'Ligar câmara')}
              </button>
            ))}
          </div>
          <div className="room-media-grid">
            {localStream && <MediaTile participant={{ memberId, name: 'Tu', avatar, stream: localStream, hasVideo: localStream.getVideoTracks().length > 0 }} local />}
            {participants.map((participant) => <MediaTile key={participant.memberId} participant={participant} />)}
            {!localStream && participants.length === 0 && <p className="media-empty">Entra na chamada e liga o microfone ou a câmara quando estiveres pronto.</p>}
          </div>
            </>
          )}
        </>
      )}
      <p className="media-privacy-note">A câmara e o microfone só são pedidos quando ativares cada controlo. O navegador pode pedir autorização. {settings.mimeEnabled ? 'A mímica está permitida.' : 'A mímica está desativada pelas regras desta sala.'}</p>
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
  )
}
