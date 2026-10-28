import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type {
  AckResult,
  ClientToServerEvents,
  MediaJoinView,
  MediaPeerView,
  MediaSignal,
  ServerToClientEvents,
} from '../realtime/protocol.ts'

type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>

type PeerConnectionState = {
  peer: MediaPeerView
  connection: RTCPeerConnection
  audioStream: MediaStream
  audioSender: RTCRtpSender
  pendingCandidates: RTCIceCandidateInit[]
}

type CallResources = {
  peers: Map<string, PeerConnectionState>
  iceServers: RTCIceServer[]
  localStream: MediaStream
  localTrack?: MediaStreamTrack
}

type ActiveMediaPeer = MediaPeerView & { audioStream: MediaStream }

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
      if (error) reject(error)
      else if (result.ok) resolve(result.data)
      else reject(new Error(result.error))
    })
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('A ligação de áudio falhou.')
}

function errorMessage(error: unknown): string {
  const mediaError = toError(error)
  if (mediaError.name === 'NotAllowedError') return 'A autorização do microfone foi recusada no navegador.'
  if (mediaError.name === 'NotFoundError') return 'Não foi encontrado um microfone compatível.'
  if (mediaError.name === 'NotReadableError') return 'O microfone está a ser usado por outra aplicação.'
  return mediaError.message
}

function closeResources(resources: CallResources): void {
  for (const peer of resources.peers.values()) peer.connection.close()
  resources.peers.clear()
  resources.localStream.getTracks().forEach((track) => track.stop())
}

export default function RoomMedia({ socket, memberId, avatar, isHost, roomStatus, settings }: RoomMediaProps) {
  const resourcesRef = useRef<CallResources | null>(null)
  const busyRef = useRef(false)
  const shouldReconnectRef = useRef(false)
  const [callActive, setCallActive] = useState(false)
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false)
  const [microphonePending, setMicrophonePending] = useState(false)
  const [participants, setParticipants] = useState<ActiveMediaPeer[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [minimized, setMinimized] = useState(false)

  const refreshParticipants = useCallback((resources: CallResources): void => {
    setParticipants([...resources.peers.values()].map(({ peer, audioStream }) => ({ ...peer, audioStream })))
  }, [])

  const sendSignal = useCallback((toMemberId: string, signal: MediaSignal): Promise<{ sent: true }> => (
    request<{ sent: true }>((ack) => socket.timeout(8000).emit('media:signal', { toMemberId, signal }, ack))
  ), [socket])

  const createPeerConnection = useCallback((
    peer: MediaPeerView,
    resources: CallResources,
    shouldOffer: boolean,
  ): PeerConnectionState => {
    const existing = resources.peers.get(peer.memberId)
    if (existing) return existing

    const connection = new RTCPeerConnection({ iceServers: resources.iceServers })
    const audioTransceiver = connection.addTransceiver('audio', { direction: 'sendrecv' })
    const state: PeerConnectionState = {
      peer,
      connection,
      audioStream: new MediaStream(),
      audioSender: audioTransceiver.sender,
      pendingCandidates: [],
    }
    resources.peers.set(peer.memberId, state)
    refreshParticipants(resources)

    connection.ontrack = (event) => {
      const stream = event.streams[0]
      if (stream) {
        state.audioStream = stream
      } else if (!state.audioStream.getTracks().some((track) => track.id === event.track.id)) {
        state.audioStream.addTrack(event.track)
      }
      refreshParticipants(resources)
    }

    connection.onicecandidate = (event) => {
      const candidate = event.candidate?.toJSON()
      if (!candidate?.candidate) return
      void sendSignal(peer.memberId, {
        type: 'candidate',
        candidate: {
          candidate: candidate.candidate,
          ...(candidate.sdpMid === undefined ? {} : { sdpMid: candidate.sdpMid }),
          ...(candidate.sdpMLineIndex === undefined ? {} : { sdpMLineIndex: candidate.sdpMLineIndex }),
          ...(candidate.usernameFragment === undefined ? {} : { usernameFragment: candidate.usernameFragment }),
        },
      }).catch((error: unknown) => setNotice(`Não foi possível enviar dados de ligação a ${peer.memberName}: ${toError(error).message}`))
    }

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed') {
        setNotice(`Não foi possível estabelecer áudio com ${peer.memberName}. A rede poderá exigir um servidor TURN.`)
      }
    }

    if (resources.localTrack) {
      void audioTransceiver.sender.replaceTrack(resources.localTrack).catch((error: unknown) => {
        setNotice(`Não foi possível partilhar o microfone com ${peer.memberName}: ${toError(error).message}`)
      })
    }

    if (shouldOffer) {
      void connection.createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .then(() => {
          const description = connection.localDescription
          if (!description?.sdp || (description.type !== 'offer' && description.type !== 'answer')) {
            throw new Error('O navegador não criou uma oferta de áudio válida.')
          }
          return sendSignal(peer.memberId, {
            type: 'description',
            description: { type: description.type, sdp: description.sdp },
          })
        })
        .catch((error: unknown) => setNotice(`Não foi possível iniciar áudio com ${peer.memberName}: ${toError(error).message}`))
    }

    return state
  }, [refreshParticipants, sendSignal])

  const handleSignal = useCallback(async (from: MediaPeerView, signal: MediaSignal): Promise<void> => {
    const resources = resourcesRef.current
    if (!resources) return

    const peer = createPeerConnection(from, resources, memberId < from.memberId)
    try {
      if (signal.type === 'candidate') {
        if (peer.connection.remoteDescription) {
          await peer.connection.addIceCandidate(signal.candidate)
        } else {
          peer.pendingCandidates.push(signal.candidate)
        }
        return
      }

      await peer.connection.setRemoteDescription(signal.description)
      if (signal.description.type === 'offer') {
        const answer = await peer.connection.createAnswer()
        await peer.connection.setLocalDescription(answer)
        const description = peer.connection.localDescription
        if (!description?.sdp || description.type !== 'answer') {
          throw new Error('O navegador não criou uma resposta de áudio válida.')
        }
        await sendSignal(from.memberId, {
          type: 'description',
          description: { type: description.type, sdp: description.sdp },
        })
      }

      for (const candidate of peer.pendingCandidates.splice(0)) {
        await peer.connection.addIceCandidate(candidate)
      }
    } catch (error) {
      setNotice(`Não foi possível estabelecer áudio com ${from.memberName}: ${toError(error).message}`)
    }
  }, [createPeerConnection, memberId, sendSignal])

  const initializeCall = useCallback(async (): Promise<void> => {
    if (resourcesRef.current || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setNotice('')
    let resources: CallResources | undefined
    try {
      if (!('RTCPeerConnection' in window)) throw new Error('Este navegador não suporta chamadas WebRTC.')
      const call = await request<MediaJoinView>(
        (ack) => socket.timeout(8000).emit('media:join', ack),
      )
      if (!('peers' in call)) throw new Error('O servidor está a usar um protocolo de áudio incompatível.')
      resources = {
        peers: new Map(),
        iceServers: call.iceServers,
        localStream: new MediaStream(),
      }
      resourcesRef.current = resources
      shouldReconnectRef.current = true
      setCallActive(true)
      setMicrophoneEnabled(false)
      for (const peer of call.peers) {
        createPeerConnection(peer, resources, memberId < peer.memberId)
      }
    } catch (error) {
      if (resources) {
        closeResources(resources)
        if (resourcesRef.current === resources) resourcesRef.current = null
      }
      setParticipants([])
      setCallActive(false)
      let cleanupMessage = ''
      try {
        await request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack))
      } catch (cleanupError) {
        cleanupMessage = ` A saída do servidor também falhou: ${toError(cleanupError).message}`
      }
      setNotice(`Não foi possível entrar na chamada: ${toError(error).message}.${cleanupMessage}`)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [createPeerConnection, memberId, socket])

  async function toggleMicrophone(): Promise<void> {
    const resources = resourcesRef.current
    if (!resources || microphonePending) return
    setMicrophonePending(true)
    setNotice('')

    if (resources.localTrack) {
      const track = resources.localTrack
      try {
        await Promise.all([...resources.peers.values()].map(({ audioSender }) => audioSender.replaceTrack(null)))
        resources.localStream.removeTrack(track)
        resources.localTrack = undefined
        track.stop()
        setMicrophoneEnabled(false)
      } catch (error) {
        setNotice(`Não foi possível desligar o microfone em todas as ligações: ${toError(error).message}`)
      } finally {
        setMicrophonePending(false)
      }
      return
    }

    let stream: MediaStream | undefined
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('O navegador não disponibiliza o microfone. Usa HTTPS e um navegador compatível.')
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const track = stream.getAudioTracks()[0]
      if (!track) throw new Error('Não foi encontrada uma faixa de microfone.')
      await Promise.all([...resources.peers.values()].map(({ audioSender }) => audioSender.replaceTrack(track)))
      resources.localStream.addTrack(track)
      resources.localTrack = track
      setMicrophoneEnabled(true)
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      setNotice(`Não foi possível ativar o microfone: ${errorMessage(error)}`)
    } finally {
      setMicrophonePending(false)
    }
  }

  const leaveCall = useCallback(async (message = ''): Promise<void> => {
    shouldReconnectRef.current = false
    const resources = resourcesRef.current
    resourcesRef.current = null
    if (resources) closeResources(resources)
    setParticipants([])
    setMicrophoneEnabled(false)
    setCallActive(false)
    setNotice(message)
    try {
      await request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack))
    } catch (error) {
      setNotice(`A chamada foi desligada neste dispositivo, mas o servidor não confirmou a saída: ${toError(error).message}`)
    }
  }, [socket])

  async function toggleRoomSetting(setting: 'audioEnabled' | 'textChatEnabled' | 'mimeEnabled'): Promise<void> {
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
    const onPeerJoined = (peer: MediaPeerView) => {
      const resources = resourcesRef.current
      if (resources) createPeerConnection(peer, resources, memberId < peer.memberId)
    }
    const onPeerLeft = ({ memberId: leftMemberId }: { memberId: string }) => {
      const resources = resourcesRef.current
      const peer = resources?.peers.get(leftMemberId)
      if (!resources || !peer) return
      peer.connection.close()
      resources.peers.delete(leftMemberId)
      refreshParticipants(resources)
    }
    const onSignal = ({ from, signal }: { from: MediaPeerView; signal: MediaSignal }) => {
      void handleSignal(from, signal)
    }
    const onCallClosed = () => {
      const resources = resourcesRef.current
      resourcesRef.current = null
      if (resources) closeResources(resources)
      setParticipants([])
      setMicrophoneEnabled(false)
      setCallActive(false)
      setNotice('O anfitrião encerrou a chamada de áudio.')
    }
    const onDisconnect = () => {
      const resources = resourcesRef.current
      shouldReconnectRef.current = Boolean(resources)
      resourcesRef.current = null
      if (resources) closeResources(resources)
      setParticipants([])
      setMicrophoneEnabled(false)
      setCallActive(false)
      if (resources) setNotice('A ligação à sala foi perdida; a chamada de áudio foi desligada.')
    }
    const onConnect = () => {
      if (!shouldReconnectRef.current) return
      shouldReconnectRef.current = false
      void initializeCall()
    }

    socket.on('media:peer-joined', onPeerJoined)
    socket.on('media:peer-left', onPeerLeft)
    socket.on('media:signal', onSignal)
    socket.on('media:closed', onCallClosed)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', onConnect)
    return () => {
      socket.off('media:peer-joined', onPeerJoined)
      socket.off('media:peer-left', onPeerLeft)
      socket.off('media:signal', onSignal)
      socket.off('media:closed', onCallClosed)
      socket.off('disconnect', onDisconnect)
      socket.off('connect', onConnect)
      const resources = resourcesRef.current
      resourcesRef.current = null
      if (resources) {
        closeResources(resources)
        if (socket.connected) {
          void request<{ left: true }>((ack) => socket.timeout(3000).emit('media:leave', ack)).catch((error: unknown) => {
            console.error('Não foi possível confirmar a saída da chamada:', error)
          })
        }
      }
    }
  }, [createPeerConnection, handleSignal, initializeCall, memberId, refreshParticipants, socket])

  useEffect(() => {
    if (settings.audioEnabled || !resourcesRef.current) return
    void leaveCall('O anfitrião desativou o áudio desta sala.')
  }, [leaveCall, settings.audioEnabled])

  return (
    <section className="room-media-panel" aria-label="Chamada de áudio da sala">
      <div className="room-media-heading">
        <div>
          <span className="eyebrow">CHAMADA DA SALA · ÁUDIO</span>
          <strong>{callActive ? `Na chamada · ${participants.length + 1} participante${participants.length === 0 ? '' : 's'}` : 'Chamada de áudio opcional'}</strong>
        </div>
        {callActive ? (
          <button className="button button-secondary" type="button" onClick={() => void leaveCall()}>Sair da chamada</button>
        ) : (
          <button className="button button-primary" type="button" disabled={busy || !socket.connected || !settings.audioEnabled} onClick={() => void initializeCall()}>
            {busy ? 'A ligar…' : 'Entrar na chamada'}
          </button>
        )}
      </div>
      <div className="room-media-policy">
        <span className={`media-policy-chip ${settings.audioEnabled ? 'media-policy-enabled' : ''}`}>
          Áudio: {settings.audioEnabled ? 'permitido' : 'desativado'}
          {isHost && roomStatus === 'open' && (
            <button type="button" onClick={() => void toggleRoomSetting('audioEnabled')} aria-label="Alterar permissão: Áudio">Alterar</button>
          )}
        </span>
        <span className="media-policy-chip">Vídeo: indisponível nesta versão</span>
        {([
          ['textChatEnabled', 'Chat'],
          ['mimeEnabled', 'Mímica'],
        ] as const).map(([setting, label]) => (
          <span className={`media-policy-chip ${settings[setting] ? 'media-policy-enabled' : ''}`} key={setting}>
            {label}: {settings[setting] ? 'permitido' : 'desativado'}
            {isHost && roomStatus === 'open' && (
              <button type="button" onClick={() => void toggleRoomSetting(setting)} aria-label={`Alterar permissão: ${label}`}>Alterar</button>
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
                <button
                  className={`media-control ${microphoneEnabled ? 'media-control-active' : ''}`}
                  type="button"
                  disabled={microphonePending || !settings.audioEnabled}
                  aria-pressed={microphoneEnabled}
                  onClick={() => void toggleMicrophone()}
                >
                  {microphonePending ? 'A ativar…' : microphoneEnabled ? 'Microfone ligado' : 'Ligar microfone'}
                </button>
              </div>
              <div className="room-media-grid">
                <article className="media-tile media-tile-local">
                  <span className="media-tile-avatar" aria-hidden="true">{avatar}</span>
                  <strong>Tu · {microphoneEnabled ? 'microfone ligado' : 'microfone desligado'}</strong>
                </article>
                {participants.map((participant) => {
                  return (
                    <article className="media-tile" key={participant.memberId}>
                      <audio autoPlay playsInline ref={(element) => { if (element) element.srcObject = participant.audioStream }} />
                      <span className="media-tile-avatar" aria-hidden="true">{participant.memberAvatar}</span>
                      <strong>{participant.memberName}</strong>
                    </article>
                  )
                })}
                {participants.length === 0 && <p className="media-empty">Ouve a equipa por áudio. Cada participante ativa o próprio microfone quando quiser.</p>}
              </div>
            </>
          )}
        </>
      )}
      <p className="media-privacy-note">
        O microfone só é solicitado quando o ativares. Áudio P2P suporta até 6 pessoas por sala e depende das redes dos participantes; algumas ligações exigem um serviço TURN externo.
        {settings.mimeEnabled ? ' A mímica está permitida.' : ' A mímica está desativada pelas regras desta sala.'}
      </p>
      {notice && <p className="notice" role="status">{notice}</p>}
    </section>
  )
}
