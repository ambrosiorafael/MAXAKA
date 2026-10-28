import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import './App.css'
import BoardTrack from './components/BoardTrack.tsx'
import { avatarCategories, avatarOptions, defaultAvatar, isAvatar } from './game/avatars.ts'
import { localCards } from './game/catalog.ts'
import {
  currentTeam,
  endAutomatedTurn,
  resolveCurrentItem,
  startMatch,
  tickMatch,
  type MatchState,
} from './game/engine.ts'
import type {
  ClientToServerEvents,
  ChatMessageView,
  MatchStateView,
  PrivateTurnView,
  RoomStateView,
  ServerToClientEvents,
} from './realtime/protocol.ts'

type Screen = 'home' | 'profile' | 'mode' | 'setup' | 'match' | 'online-room' | 'online-match' | 'help' | 'credits'
type OnlineAction = 'create' | 'join' | null
type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>
const configuredRealtimeServer = import.meta.env.VITE_SERVER_URL?.trim() || undefined
const RoomMedia = lazy(() => import('./components/RoomMedia.tsx'))

type Player = {
  id: string
  name: string
  avatar: string
  isBot: boolean
}

type Team = {
  id: number
  name: string
  color: string
  members: Player[]
}

const avatars = avatarOptions.map(({ emoji }) => emoji)
const botNames = ['Paito', 'Ana', 'Maria', 'João', 'Marcos', 'José', 'Shelton', 'Sharmyla', 'Andressa', 'Winney', 'Sónia', 'Telma']
const teamColors = ['orange', 'blue', 'green', 'purple', 'pink']

function loadSavedAvatar(): string {
  try {
    const saved = window.localStorage.getItem('maxaka.avatar')
    return saved && isAvatar(saved) ? saved : defaultAvatar
  } catch {
    return defaultAvatar
  }
}

function createTeams(count: number, player: Player): Team[] {
  let nextBotIndex = 0

  return Array.from({ length: count }, (_, index) => {
    const team: Team = {
      id: index + 1,
      name: `Equipa ${index + 1}`,
      color: teamColors[index % teamColors.length],
      members: [],
    }

    if (index === 0) team.members.push(player)
    const memberCount = index === 1 ? 2 : 1
    for (let memberIndex = 0; memberIndex < memberCount; memberIndex += 1) {
      const botIndex = nextBotIndex
      nextBotIndex += 1
      team.members.push({
        id: `bot-${index}-${memberIndex}`,
        name: botNames[botIndex % botNames.length],
        avatar: avatars[(botIndex + 2) % avatars.length],
        isBot: true,
      })
    }

    return team
  })
}

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [onlineAction, setOnlineAction] = useState<OnlineAction>(null)
  const [playerName, setPlayerName] = useState('')
  const [avatar, setAvatar] = useState(loadSavedAvatar)
  const [savedAvatar, setSavedAvatar] = useState(loadSavedAvatar)
  const [avatarCategoryId, setAvatarCategoryId] = useState(avatarCategories[0].id)
  const [avatarNotice, setAvatarNotice] = useState('')
  const [teamCount, setTeamCount] = useState(2)
  const [createRoomSettings, setCreateRoomSettings] = useState<RoomStateView['mediaSettings']>({
    audioEnabled: true,
    videoEnabled: true,
    textChatEnabled: true,
    mimeEnabled: true,
  })
  const [teams, setTeams] = useState<Team[]>([])
  const [match, setMatch] = useState<MatchState | null>(null)
  const [selectedTeam, setSelectedTeam] = useState(1)
  const [notice, setNotice] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [realtime, setRealtime] = useState<RealtimeSocket | null>(null)
  const [myOnlineMemberId, setMyOnlineMemberId] = useState('')
  const [onlineRoom, setOnlineRoom] = useState<RoomStateView | null>(null)
  const [onlineMatch, setOnlineMatch] = useState<MatchStateView | null>(null)
  const [privateTurn, setPrivateTurn] = useState<PrivateTurnView | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessageView[]>([])
  const [chatDraft, setChatDraft] = useState('')
  const matchRef = useRef(match)
  const realtimeRef = useRef<RealtimeSocket | null>(null)

  const currentPlayer: Player = {
    id: 'local-player',
    name: playerName.trim() || 'Jogador',
    avatar,
    isBot: false,
  }
  const activeTeam = match ? currentTeam(match) : undefined
  const activeTurn = match?.turn
  const activeItem = activeTurn?.card.items[activeTurn.itemIndex]
  const onlineTeamCounts = onlineRoom
    ? Array.from({ length: onlineRoom.teamCount }, (_, index) => onlineRoom.members.filter((member) => member.teamId === index + 1).length)
    : []
  const canStartOnline = onlineTeamCounts.length > 1 && onlineTeamCounts.every((count) => count >= 2 && count <= 6)
  const onlineWinner = onlineMatch?.teams.find((team) => team.id === onlineMatch.winnerTeamId)
  const localWinner = match?.winnerTeamId !== null ? match?.teams.find((team) => team.id === match.winnerTeamId) : null
  const onlineWinnerInProgress = onlineMatch?.winnerTeamId !== null && onlineMatch?.teams.some((team) => team.position < onlineMatch.boardLength)
  const localWinnerInProgress = match?.winnerTeamId !== null && match?.teams.some((team) => team.position < match.boardLength)
  const selectedAvatarCategory = avatarCategories.find((category) => category.id === avatarCategoryId) ?? avatarCategories[0]

  useEffect(() => {
    matchRef.current = match
  }, [match])

  useEffect(() => {
    const current = matchRef.current
    if (!current || current.status !== 'playing' || current.turn?.role === 'automated') return
    const timer = window.setInterval(() => {
      setMatch((current) => current ? tickMatch(current) : current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [match?.status, match?.turn?.role])

  useEffect(() => {
    const current = matchRef.current
    if (!current || current.status !== 'playing' || current.turn?.role !== 'automated') return
    const cardId = current.turn.card.id
    const teamId = current.turn.teamId
    const turnsPlayed = current.teamTurnsPlayed[teamId] ?? 0
    const teamIndex = current.currentTeamIndex
    const timeout = window.setTimeout(() => {
      const simulatedCorrectCount = 1 + ((cardId.length + teamIndex + turnsPlayed) % 4)
      setMatch((current) => current ? endAutomatedTurn(current, simulatedCorrectCount) : current)
    }, 2200)
    return () => window.clearTimeout(timeout)
  }, [match?.status, match?.turn?.role, match?.turn?.card.id, match?.currentTeamIndex, match?.teamTurnsPlayed])

  function beginProfile() {
    setOnlineAction(null)
    setScreen('profile')
  }

  function beginOnline(action: Exclude<OnlineAction, null>) {
    setOnlineAction(action)
    setNotice('')
    setScreen('profile')
  }

  function connectRealtime(): RealtimeSocket {
    if (realtimeRef.current) return realtimeRef.current
    const token = sessionStorage.getItem('maxaka.session')
    const client = io(sessionStorage.getItem('maxaka.server') || configuredRealtimeServer, {
      auth: token ? { sessionToken: token } : {},
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 800,
    })
    client.on('connect', () => {
      setRealtime(client)
      setMyOnlineMemberId(sessionStorage.getItem('maxaka.member') ?? '')
    })
    client.on('room:state', (room) => {
      setOnlineRoom(room)
      setScreen(room.status === 'open' ? 'online-room' : 'online-match')
    })
    client.on('match:state', (matchState) => {
      setOnlineMatch(matchState)
      setPrivateTurn((current) => current?.teamId === matchState.currentTeamId ? current : null)
      if (matchState.status === 'playing' || matchState.status === 'finished') setScreen('online-match')
    })
    client.on('turn:private', setPrivateTurn)
    client.on('chat:message', (message) => setChatMessages((current) => [...current, message].slice(-50)))
    client.on('room:closed', ({ message }) => {
      sessionStorage.removeItem('maxaka.session')
      sessionStorage.removeItem('maxaka.member')
      sessionStorage.removeItem('maxaka.server')
      setOnlineRoom(null)
      setOnlineMatch(null)
      setPrivateTurn(null)
      setMyOnlineMemberId('')
      setChatMessages([])
      setScreen('mode')
      setNotice(message)
      realtimeRef.current = null
      setRealtime(null)
      client.disconnect()
    })
    client.on('server:error', setNotice)
    client.on('connect_error', () => setNotice('Não foi possível ligar ao servidor. Confirma a configuração online e tenta novamente.'))
    client.on('disconnect', (reason) => {
      if (reason !== 'io client disconnect') setNotice('Ligação perdida. A tentar voltar à sala…')
    })
    realtimeRef.current = client
    return client
  }

  useEffect(() => {
    if (sessionStorage.getItem('maxaka.session')) connectRealtime()
  }, [])

  function saveAvatarPreference(): void {
    try {
      window.localStorage.setItem('maxaka.avatar', avatar)
      setSavedAvatar(avatar)
      setAvatarNotice('Avatar guardado neste dispositivo.')
    } catch {
      setAvatarNotice('Não foi possível guardar o avatar neste dispositivo. A escolha continua ativa nesta sessão.')
    }
  }

  function cancelAvatarSelection(): void {
    setAvatar(savedAvatar)
    setAvatarNotice('')
  }

  function continueFromProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (playerName.trim().length < 2) {
      setNotice('Escolhe um nome com pelo menos 2 caracteres.')
      return
    }

    saveAvatarPreference()
    setNotice('')
    if (onlineAction) {
      const client = connectRealtime()
      const displayName = playerName.trim()
      if (onlineAction === 'create') {
        client.timeout(5000).emit(
          'room:create',
          { name: displayName, avatar, teamCount, mediaSettings: createRoomSettings },
          (error, result) => {
            if (error || !result) {
              setNotice('O servidor online não respondeu. Confirma MySQL e reinicia o servidor.')
            } else if (result.ok) {
              sessionStorage.setItem('maxaka.session', result.data.sessionToken)
              sessionStorage.setItem('maxaka.member', result.data.memberId)
              if (result.data.serverUrl) sessionStorage.setItem('maxaka.server', result.data.serverUrl)
              else sessionStorage.removeItem('maxaka.server')
              setMyOnlineMemberId(result.data.memberId)
              client.auth = { sessionToken: result.data.sessionToken }
              setOnlineRoom(result.data.room)
              setChatMessages([])
              setScreen('online-room')
            } else {
              setNotice(result.error)
            }
          },
        )
      } else {
        const joinPayload = { code: roomCode.trim().toUpperCase(), name: displayName, avatar }
        const joinOnServer = (activeClient: RealtimeSocket, redirects = 0): void => {
          activeClient.timeout(5000).emit('room:join', joinPayload, (error, result) => {
            if (!error && result && !result.ok && result.redirectTo && redirects < 2) {
              sessionStorage.setItem('maxaka.server', result.redirectTo)
              if (realtimeRef.current === activeClient) {
                realtimeRef.current = null
                setRealtime(null)
              }
              activeClient.disconnect()
              const ownerClient = connectRealtime()
              const retryJoin = () => joinOnServer(ownerClient, redirects + 1)
              if (ownerClient.connected) retryJoin()
              else ownerClient.once('connect', retryJoin)
              setNotice('A ligar-te ao servidor da sala…')
            } else if (error || !result) {
              setNotice('O servidor online não respondeu. Confirma MySQL e reinicia o servidor.')
            } else if (result.ok) {
              sessionStorage.setItem('maxaka.session', result.data.sessionToken)
              sessionStorage.setItem('maxaka.member', result.data.memberId)
              if (result.data.serverUrl) sessionStorage.setItem('maxaka.server', result.data.serverUrl)
              else sessionStorage.removeItem('maxaka.server')
              setMyOnlineMemberId(result.data.memberId)
              activeClient.auth = { sessionToken: result.data.sessionToken }
              setOnlineRoom(result.data.room)
              setChatMessages([])
              setScreen('online-room')
            } else {
              setNotice(result.error)
            }
          })
        }
        joinOnServer(client)
      }
      return
    }
    const initialTeams = createTeams(teamCount, currentPlayer)
    setTeams(initialTeams)
    setScreen('setup')
  }

  function changeTeamCount(value: number) {
    setTeamCount(value)
    setTeams(createTeams(value, currentPlayer))
    setSelectedTeam(1)
  }

  function addBot(teamId: number) {
    setTeams((currentTeams) =>
      currentTeams.map((team) => {
        if (team.id !== teamId || team.members.length >= 6) return team

        const usedNames = new Set(currentTeams.flatMap((item) => item.members.map((member) => member.name)))
        const nextName = botNames.find((name) => !usedNames.has(name)) ?? `Bot ${team.members.length + 1}`
        const nextAvatar = avatars[(team.members.length + team.id) % avatars.length]

        return {
          ...team,
          members: [
            ...team.members,
            { id: `bot-${teamId}-${Date.now()}`, name: nextName, avatar: nextAvatar, isBot: true },
          ],
        }
      }),
    )
  }

  function movePlayer(playerId: string, destinationId: number) {
    setTeams((currentTeams) => {
      const sourceTeam = currentTeams.find((team) => team.members.some((member) => member.id === playerId))
      const destination = currentTeams.find((team) => team.id === destinationId)
      if (!sourceTeam || !destination || sourceTeam.id === destinationId || destination.members.length >= 6) return currentTeams

      const movingPlayer = sourceTeam.members.find((member) => member.id === playerId)
      if (!movingPlayer || sourceTeam.members.length <= 2) return currentTeams

      return currentTeams.map((team) => {
        if (team.id === sourceTeam.id) return { ...team, members: team.members.filter((member) => member.id !== playerId) }
        if (team.id === destinationId) return { ...team, members: [...team.members, movingPlayer] }
        return team
      })
    })
  }

  const canStartDemo = teams.length >= 2 && teams.every((team) => team.members.length >= 2 && team.members.length <= 6)

  function startDemo() {
    if (!canStartDemo) {
      setNotice('Cada equipa precisa de ter entre 2 e 6 jogadores.')
      return
    }
    setNotice('')
    setMatch(startMatch(teams, localCards))
    setScreen('match')
  }

  function resolveItem(correct: boolean) {
    setMatch((current) => current ? resolveCurrentItem(current, correct) : current)
  }

  function restartMatch() {
    setMatch(startMatch(teams, localCards))
  }

  function changeOnlineTeam(memberId: string, teamId: number) {
    if (!realtime) return
    realtime.timeout(5000).emit('room:team', { memberId, teamId }, (error, result) => {
      if (error || !result) setNotice('A sala não respondeu à alteração da equipa.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function addOnlineBot(teamId: number) {
    if (!realtime) return
    realtime.timeout(5000).emit('room:add-bot', { teamId }, (error, result) => {
      if (error || !result) setNotice('A sala não respondeu ao pedido para adicionar um bot.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function startOnlineGame() {
    if (!realtime) return
    realtime.timeout(5000).emit('match:start', (error, result) => {
      if (error || !result) setNotice('O servidor não respondeu ao pedido de início.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function copyRoomCode() {
    if (!onlineRoom) return
    void navigator.clipboard.writeText(onlineRoom.code).then(
      () => setNotice('Código copiado. Partilha-o com a tua equipa.'),
      () => setNotice('Não foi possível copiar o código. Podes selecioná-lo e copiá-lo manualmente.'),
    )
  }

  function resolveOnlineItem(correct: boolean) {
    if (!realtime) return
    realtime.timeout(5000).emit('match:resolve', { correct }, (error, result) => {
      if (error || !result) setNotice('O servidor não respondeu ao resultado do item.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = chatDraft.trim()
    if (!text || !realtime) return
    realtime.timeout(5000).emit('chat:send', { text }, (error, result) => {
      if (error || !result) setNotice('Não foi possível enviar a mensagem.')
      else if (!result.ok) setNotice(result.error)
      else {
        setChatDraft('')
        setNotice('')
      }
    })
  }

  function leaveOnlineRoom() {
    if (!realtime) {
      setScreen('mode')
      return
    }
    realtime.timeout(5000).emit('room:leave', (error, result) => {
      if (error || !result || !result.ok) setNotice(result && !result.ok ? result.error : 'Não foi possível sair da sala.')
      else {
        const wasHost = onlineRoom?.hostId === myOnlineMemberId
        sessionStorage.removeItem('maxaka.session')
        sessionStorage.removeItem('maxaka.member')
        sessionStorage.removeItem('maxaka.server')
        setOnlineRoom(null)
        setOnlineMatch(null)
        setPrivateTurn(null)
        setMyOnlineMemberId('')
        setScreen('mode')
        setNotice(wasHost ? 'O anfitrião encerrou a sala. A partida terminou e todos os jogadores foram retirados da sala.' : '')
      }
    })
  }

  function goBack() {
    setNotice('')
    if (screen === 'profile') setScreen('mode')
    else if (screen === 'mode' || screen === 'help' || screen === 'credits') setScreen('home')
    else if (screen === 'setup') setScreen('mode')
    else if (screen === 'match') setScreen('setup')
    else if (screen === 'online-room' || screen === 'online-match') leaveOnlineRoom()
    else setScreen('home')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setScreen('home')} aria-label="MAXAKA, menu principal">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MAXAKA<span className="brand-period">.</span></span>
        </button>
        <div className="topbar-right">
          <span className="prototype-badge"><span className="status-dot" /> Jogo local jogável</span>
          <button className="icon-button help-button" type="button" onClick={() => setScreen('help')} aria-label="Ajuda">?</button>
        </div>
      </header>

      <div className="page-content">
        {screen !== 'home' && (
          <button className="back-link" type="button" onClick={goBack}>
            <span aria-hidden="true">←</span> Voltar
          </button>
        )}
        {onlineRoom && realtime && myOnlineMemberId && (screen === 'online-room' || screen === 'online-match') && (
          <Suspense fallback={<p className="media-loading">A preparar a área de comunicação…</p>}>
            <RoomMedia
              socket={realtime}
              memberId={myOnlineMemberId}
              avatar={onlineRoom.members.find((member) => member.id === myOnlineMemberId)?.avatar ?? avatar}
              isHost={onlineRoom.hostId === myOnlineMemberId}
              roomStatus={onlineRoom.status}
              settings={onlineRoom.mediaSettings}
            />
          </Suspense>
        )}

        {screen === 'home' && (
          <section className="home-screen">
            <div className="home-copy">
              <span className="eyebrow"><span className="eyebrow-star">✳</span> O jogo de palavras de Moçambique</span>
              <h1>Junta a malta.<br /><span>Solta a língua.</span></h1>
              <p className="home-description">Dá pistas, adivinha palavras e leva a tua equipa até à vitória. A diversão começa à volta da mesa.</p>
              <div className="home-actions">
                <button className="button button-primary" type="button" onClick={() => setScreen('mode')}>
                  Vamos jogar <span aria-hidden="true">↗</span>
                </button>
                <button className="button button-subtle" type="button" onClick={() => setScreen('help')}>Como se joga?</button>
              </div>
              <div className="home-footnote"><span className="mini-avatars">🦁 🐘 🦜</span> Feito para jogar em boa companhia</div>
            </div>
            <div className="hero-board" aria-label="Ilustração decorativa de um tabuleiro de jogo">
              <div className="sunburst" />
              <div className="board-card">
                <div className="board-card-top"><span>DESAFIO DE PALAVRAS</span><span className="card-spark">✳</span></div>
                <div className="board-word">MAX<br /><span>AKA</span></div>
                <div className="board-card-bottom"><span>30 SEGUNDOS</span><span>✦ 5 PALAVRAS</span></div>
              </div>
              <span className="float-badge badge-one">🎲</span>
              <span className="float-badge badge-two">Mng</span>
              <span className="float-badge badge-three">5/5</span>
              <div className="board-dots" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
            <div className="home-bottom">
              <span>PALAVRAS, RISOS E UM BOCADO DE COMPETIÇÃO.</span>
              <span>01 — 03 <span className="bottom-lines">━━</span></span>
            </div>
          </section>
        )}

        {screen === 'mode' && (
          <section className="content-section">
            <div className="section-heading">
              <span className="eyebrow">PRIMEIRO, ESCOLHE O TEU CAMINHO</span>
              <h1>Como queres <span>jogar?</span></h1>
              <p>Começa uma partida local ou prepara-te para reunir a equipa online.</p>
            </div>
            <div className="mode-grid">
              <button className="mode-card mode-card-active" type="button" onClick={beginProfile}>
                <span className="mode-icon">🤖</span><span className="mode-tag">PARTIDA LOCAL JOGÁVEL</span>
                <strong>Jogar com bots</strong><span>Forma as equipas, joga rondas com tempo e corre até à meta.</span>
                <span className="mode-card-cta">Preparar jogo <b>↗</b></span>
              </button>
              <button className="mode-card mode-card-active" type="button" onClick={() => beginOnline('create')}>
                <span className="mode-icon">🌍</span><span className="mode-tag">SALA ONLINE</span>
                <strong>Criar sala online</strong><span>Junta amigos numa sala privada com código.</span>
                <span className="mode-card-cta">Criar sala <b>↗</b></span>
              </button>
              <button className="mode-card mode-card-active" type="button" onClick={() => beginOnline('join')}>
                <span className="mode-icon">🔑</span><span className="mode-tag">CÓDIGO DE CONVITE</span>
                <strong>Entrar numa sala</strong><span>Entra na sala de alguém usando o código de convite.</span>
                <span className="mode-card-cta">Introduzir código <b>↗</b></span>
              </button>
            </div>
            <div className="section-footnote"><span className="status-dot" /> As salas online precisam do backend e do MySQL configurados.</div>
          </section>
        )}

        {screen === 'profile' && (
          <section className="content-section narrow-section">
            <div className="section-heading">
              <span className="eyebrow">A TUA VEZ DE ENTRAR NO JOGO</span>
              <h1>Quem és <span>tu?</span></h1>
              <p>Escolhe um nome e um avatar. Não precisas de criar conta.</p>
            </div>
            <form className="profile-panel" onSubmit={continueFromProfile}>
              <label htmlFor="player-name">O teu nome</label>
              <input id="player-name" autoComplete="nickname" maxLength={24} value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Como te chamam?" />
              <div className="field-caption">{playerName.trim().length}/24 caracteres · mínimo 2</div>
              {onlineAction === 'join' && (
                <>
                  <label htmlFor="room-code">Código da sala</label>
                  <input id="room-code" className="room-code-input" autoComplete="off" maxLength={6} value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/gu, ''))} placeholder="EX. MXK482" />
                  <div className="field-caption">O código tem seis caracteres</div>
                </>
              )}
              {onlineAction === 'create' && (
                <>
                  <label htmlFor="online-team-count">Número de equipas</label>
                  <select id="online-team-count" className="team-count-select" value={teamCount} onChange={(event) => setTeamCount(Number(event.target.value))}>
                    {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} equipas</option>)}
                  </select>
                  <div className="field-caption">Cada equipa precisa de 2 a 6 participantes antes do início</div>
                  <span className="field-label">Regras de comunicação da sala</span>
                  <div className="create-room-settings">
                    {([
                      ['audioEnabled', 'Permitir áudio'],
                      ['videoEnabled', 'Permitir vídeo'],
                      ['textChatEnabled', 'Permitir chat de texto'],
                      ['mimeEnabled', 'Permitir mímica'],
                    ] as const).map(([setting, label]) => (
                      <label className="create-room-setting" key={setting}>
                        <input
                          type="checkbox"
                          checked={createRoomSettings[setting]}
                          onChange={(event) => setCreateRoomSettings((current) => ({ ...current, [setting]: event.target.checked }))}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="field-caption">As permissões ficam bloqueadas quando a partida começar; microfone e câmara continuam sob controlo individual.</div>
                </>
              )}
              <span className="field-label">Escolhe o teu avatar</span>
              <div className="avatar-preview" aria-live="polite">
                <span className="avatar-preview-emoji" aria-hidden="true">{avatar}</span>
                <span><strong>{avatarOptions.find((item) => item.emoji === avatar)?.name ?? 'Avatar escolhido'}</strong><small>Pré-visualização</small></span>
              </div>
              <div className="avatar-categories" role="group" aria-label="Categorias de avatares">
                {avatarCategories.map((category) => (
                  <button
                    className={`avatar-category ${avatarCategoryId === category.id ? 'avatar-category-selected' : ''}`}
                    key={category.id}
                    type="button"
                    aria-pressed={avatarCategoryId === category.id}
                    onClick={() => setAvatarCategoryId(category.id)}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <div className="avatar-picker" role="group" aria-label={`Avatares: ${selectedAvatarCategory.label}`}>
                {selectedAvatarCategory.avatars.map((item) => (
                  <button
                    className={`avatar-choice ${avatar === item.emoji ? 'selected' : ''}`}
                    key={`${item.emoji}-${item.name}`}
                    type="button"
                    aria-label={`Avatar ${item.name}`}
                    title={item.name}
                    aria-pressed={avatar === item.emoji}
                    onClick={() => { setAvatar(item.emoji); setAvatarNotice('') }}
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
              <div className="avatar-actions">
                <button className="button button-secondary" type="button" onClick={saveAvatarPreference} disabled={avatar === savedAvatar}>Guardar avatar</button>
                <button className="button button-subtle" type="button" onClick={cancelAvatarSelection} disabled={avatar === savedAvatar}>Cancelar</button>
              </div>
              {avatarNotice && <p className="avatar-notice" role="status">{avatarNotice}</p>}
              {notice && <p className="notice" role="status">{notice}</p>}
              <button className="button button-primary button-wide" type="submit">{onlineAction === 'create' ? 'Criar sala' : onlineAction === 'join' ? 'Entrar na sala' : 'Continuar'} <span aria-hidden="true">→</span></button>
            </form>
          </section>
        )}

        {screen === 'setup' && (
          <section className="content-section setup-section">
            <div className="section-heading">
              <span className="eyebrow">PARTIDA LOCAL · CARTAS INCLUÍDAS NO JOGO</span>
              <h1>Forma as <span>equipas.</span></h1>
              <p>Entre 2 e 6 jogadores por equipa. Podes misturar pessoas e bots.</p>
            </div>
            <div className="setup-toolbar">
              <label htmlFor="team-count">Número de equipas</label>
              <select id="team-count" value={teamCount} onChange={(event) => changeTeamCount(Number(event.target.value))}>
                {[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} equipas</option>)}
              </select>
              <span className="setup-note">Cada equipa: 2–6 jogadores</span>
            </div>
            <div className="teams-grid">
              {teams.map((team) => (
                <article className={`team-card team-${team.color} ${selectedTeam === team.id ? 'team-selected' : ''}`} key={team.id}>
                  <button className="team-select" type="button" onClick={() => setSelectedTeam(team.id)} aria-pressed={selectedTeam === team.id}>
                    <span className="team-token">{team.id}</span>
                    <span><strong>{team.name}</strong><small>{team.members.length} jogadores</small></span>
                    {selectedTeam === team.id && <span className="selected-mark">✓</span>}
                  </button>
                  <ul className="member-list">
                    {team.members.map((member) => (
                      <li className="member" key={member.id}>
                        <span className="member-avatar">{member.avatar}</span>
                        <span className="member-name">{member.name}{member.id === currentPlayer.id ? <small>Tu</small> : null}</span>
                        {member.isBot && <span className="bot-chip">BOT</span>}
                        {teams.length > 1 && team.members.length > 2 && (
                          <select aria-label={`Mover ${member.name} para outra equipa`} value={team.id} onChange={(event) => movePlayer(member.id, Number(event.target.value))}>
                            {teams.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button className="add-bot-button" type="button" disabled={team.members.length >= 6} onClick={() => addBot(team.id)}>
                    <span>＋</span> Adicionar bot
                  </button>
                </article>
              ))}
            </div>
            <div className="setup-footer">
              <span className="section-footnote"><span className="status-dot" /> Os bots são participantes de demonstração.</span>
              <button className="button button-primary" type="button" onClick={startDemo} disabled={!canStartDemo}>Começar partida <span aria-hidden="true">→</span></button>
            </div>
            {notice && <p className="notice" role="status">{notice}</p>}
          </section>
        )}

        {screen === 'match' && (
          <section className="content-section match-section">
            {match && activeTeam && (match.status === 'finished' || match.turn) && (
              <>
                {match.status === 'finished' ? (
                  <div className="winner-banner" role="status">
                    <span className="winner-trophy">🏆</span>
                    <div><span className="eyebrow">FIM DA PARTIDA</span><h1>{localWinner?.name ?? 'Partida terminada'} <span>venceu!</span></h1></div>
                    <button className="button button-primary" type="button" onClick={restartMatch}>Jogar novamente <span aria-hidden="true">↻</span></button>
                  </div>
                ) : (
                  <div className="match-header">
                    <div><span className="eyebrow">PARTIDA LOCAL · REGRAS EM EXECUÇÃO</span><h1>É hora de <span>jogar!</span></h1></div>
                    <div className={`timer-preview ${match.secondsLeft <= 10 ? 'timer-warning' : ''}`} aria-live="polite">
                      <small>TEMPO DA RONDA</small><strong>00:{String(match.secondsLeft).padStart(2, '0')}</strong><span>{activeTurn?.role === 'automated' ? 'Bots a jogar' : 'Cronómetro ativo'}</span>
                    </div>
                  </div>
                )}
                {match.status === 'playing' && localWinnerInProgress && localWinner && (
                  <div className="winner-banner winner-banner-inline" role="status">
                    <span className="winner-trophy">🏆</span>
                    <div><span className="eyebrow">LÍDER DA PARTIDA</span><h1>{localWinner.name} <span>já está à frente</span></h1></div>
                  </div>
                )}
                {match.status === 'playing' && activeTurn && (
                  <div className="turn-banner">
                    <span className={`team-token team-token-${activeTeam.color}`}>{activeTeam.id}</span>
                    <div><small>VEZ DA</small><strong>{activeTeam.name}</strong></div>
                    <span className="turn-role">{activeTurn.role === 'human-guesses' ? 'Adivinha a pista do bot' : activeTurn.role === 'human-gives' ? 'Dá pistas à tua equipa' : 'A equipa de bots está a jogar'}</span>
                    <span className="turn-card-count">CARTA {activeTurn.itemIndex + 1} / 5</span>
                  </div>
                )}
                {match.status === 'playing' && activeTurn && (
                  <div className="match-layout">
                    <div className={`preview-card active-game-card ${activeTurn.role === 'human-gives' ? 'giver-card' : ''}`}>
                      <div className="preview-card-top">
                        <span>{activeTurn.role === 'human-guesses' ? `PISTA · ${activeTurn.card.category.toLocaleUpperCase('pt-PT')}` : `CARTA · ${activeTurn.card.category.toLocaleUpperCase('pt-PT')}`}</span>
                        <span>{activeTurn.itemIndex + 1} / 5</span>
                      </div>
                      {activeTurn.role === 'human-guesses' ? (
                        <>
                          <div className="preview-card-word hint-word">{activeItem?.hint}</div>
                          <p>O bot dá a pista. Adivinha o item e confirma quando a equipa acertar.</p>
                        </>
                      ) : activeTurn.role === 'human-gives' ? (
                        <>
                          <div className="giver-word-list">
                            {activeTurn.card.items.map((item, index) => (
                              <div className={`giver-word ${activeTurn.results[index] !== 'pending' ? 'giver-word-done' : ''} ${index === activeTurn.itemIndex ? 'giver-word-current' : ''}`} key={`${activeTurn.card.id}-${item.word}`}>
                                <span>{activeTurn.results[index] === 'correct' ? '✓' : activeTurn.results[index] === 'skipped' ? '↷' : String(index + 1).padStart(2, '0')}</span>
                                <strong>{item.word}</strong>
                              </div>
                            ))}
                          </div>
                          <p>Dá pistas sem dizer a palavra. Marca o acerto ou passa para a seguinte.</p>
                        </>
                      ) : (
                        <>
                          <div className="preview-card-word bot-thinking">🤖</div>
                          <p>Os bots desta equipa estão a jogar a ronda automaticamente…</p>
                        </>
                      )}
                      {activeTurn.role !== 'automated' && (
                        <div className="game-actions">
                          <button className="button button-secondary skip-button" type="button" onClick={() => resolveItem(false)}>Passar <span aria-hidden="true">↷</span></button>
                          <button className="button button-primary" type="button" onClick={() => resolveItem(true)}>{activeTurn.role === 'human-guesses' ? 'Acertámos!' : 'A equipa acertou'} <span aria-hidden="true">✓</span></button>
                        </div>
                      )}
                    </div>
                    <div className="board-panel live-board-panel">
                      <div className="board-panel-heading"><div><span className="eyebrow">TABULEIRO · META NA CASA {match.boardLength}</span><strong>Corrida até à meta</strong></div><span className="finish-flag">🏁</span></div>
                      <BoardTrack teams={match.teams} boardLength={match.boardLength} activeTeamId={activeTeam.id} />
                      <div className="team-score-list">
                        {match.teams.map((team) => <div className={`score-row score-${team.color} ${team.id === activeTeam.id ? 'score-active' : ''}`} key={team.id}><span className="score-dot" /><span className="score-team-info"><span>{team.name}</span><span className="score-members">{team.members.map((member) => <span key={member.id} title={member.name} aria-label={member.name}>{member.avatar}</span>)}</span></span><strong>{team.position} / {match.boardLength}</strong></div>)}
                      </div>
                    </div>
                  </div>
                )}
                {match.status === 'finished' && (
                  <>
                    <div className="board-panel live-board-panel">
                      <div className="board-panel-heading"><div><span className="eyebrow">TABULEIRO FINAL · META NA CASA {match.boardLength}</span><strong>Corrida até à meta</strong></div><span className="finish-flag">🏁</span></div>
                      <BoardTrack teams={match.teams} boardLength={match.boardLength} activeTeamId={match.winnerTeamId ?? 0} />
                    </div>
                    <div className="final-scores">
                      {match.teams.toSorted((left, right) => right.position - left.position).map((team, index) => <div className={`final-score score-${team.color}`} key={team.id}><span>{index + 1}.</span><strong>{team.name}</strong><span>{team.position} casas</span></div>)}
                    </div>
                  </>
                )}
                <div className="match-footer">
                  <span>{match.turn?.role === 'human-gives' ? 'Falar, escrever e fazer mímica são permitidos.' : 'Cada acerto avança uma casa; passar não avança.'}</span>
                  <button className="button button-secondary" type="button" onClick={() => setScreen('setup')}>Terminar partida</button>
                </div>
              </>
            )}
          </section>
        )}

        {screen === 'online-room' && onlineRoom && (
          <section className="content-section setup-section online-section">
            <div className="online-room-header">
              <div>
                <span className="eyebrow">SALA ONLINE · {onlineRoom.status === 'open' ? 'À ESPERA DA EQUIPA' : 'PARTIDA EM CURSO'}</span>
                <h1>Junta a tua <span>equipa.</span></h1>
                <p>Partilha este código para os outros jogadores entrarem.</p>
              </div>
              <button className="room-code-card" type="button" onClick={copyRoomCode} aria-label={`Copiar código ${onlineRoom.code}`}>
                <small>CÓDIGO DA SALA</small><strong>{onlineRoom.code}</strong><span>Copiar código ↗</span>
              </button>
            </div>
            <div className="online-layout">
              <div className="online-teams">
                <div className="setup-toolbar">
                  <strong>Equipas</strong><span className="setup-note">{onlineRoom.members.length} participantes · {onlineRoom.teamCount} equipas</span>
                </div>
                <div className="teams-grid">
                  {Array.from({ length: onlineRoom.teamCount }, (_, index) => {
                    const teamId = index + 1
                    const teamMembers = onlineRoom.members.filter((member) => member.teamId === teamId)
                    const teamColor = teamColors[(teamId - 1) % teamColors.length]
                    return (
                      <article className={`team-card team-${teamColor}`} key={teamId}>
                        <div className="team-select team-select-static">
                          <span className={`team-token team-token-${teamColor}`}>{teamId}</span>
                          <span><strong>Equipa {teamId}</strong><small>{teamMembers.length} / 6 jogadores</small></span>
                          {teamMembers.length < 2 && <span className="needs-players">Faltam jogadores</span>}
                        </div>
                        <ul className="member-list">
                          {teamMembers.map((member) => (
                            <li className="member" key={member.id}>
                              <span className="member-avatar">{member.avatar}</span>
                              <span className="member-name">{member.name}{member.id === myOnlineMemberId ? <small>Tu</small> : null}</span>
                              {member.isHost && <span className="host-chip">ANFITRIÃO</span>}
                              {member.isBot && <span className="bot-chip">BOT</span>}
                              <span className={`connection-dot ${member.isOnline ? 'connection-online' : ''}`} aria-label={member.isOnline ? 'Ligado' : 'Desligado'} />
                              {onlineRoom.status === 'open' && (onlineRoom.hostId === myOnlineMemberId || member.id === myOnlineMemberId) && (
                                <select aria-label={`Mover ${member.name} para outra equipa`} value={member.teamId} onChange={(event) => changeOnlineTeam(member.id, Number(event.target.value))}>
                                  {Array.from({ length: onlineRoom.teamCount }, (_, teamIndex) => <option key={teamIndex + 1} value={teamIndex + 1}>Equipa {teamIndex + 1}</option>)}
                                </select>
                              )}
                            </li>
                          ))}
                        </ul>
                        {onlineRoom.status === 'open' && onlineRoom.hostId === myOnlineMemberId && (
                          <button className="add-bot-button" type="button" disabled={teamMembers.length >= 6} onClick={() => addOnlineBot(teamId)}><span>＋</span> Adicionar bot</button>
                        )}
                      </article>
                    )
                  })}
                </div>
                {notice && <p className="notice" role="status">{notice}</p>}
                <div className="setup-footer">
                  <span className="section-footnote"><span className="status-dot" /> Cada equipa precisa de pelo menos 2 jogadores.</span>
                  {onlineRoom.hostId === myOnlineMemberId ? (
                    <button className="button button-primary" type="button" disabled={!canStartOnline} onClick={startOnlineGame}>Iniciar partida <span aria-hidden="true">→</span></button>
                  ) : <span className="waiting-host">À espera que o anfitrião inicie a partida…</span>}
                </div>
                {onlineRoom.hostId === myOnlineMemberId && !canStartOnline && <p className="field-caption">Adiciona bots ou convida jogadores até cada equipa ter pelo menos 2 pessoas.</p>}
              </div>
              <aside className="chat-panel">
                <div className="chat-heading"><span>CHAT DA SALA</span><span className="chat-live"><i /> AO VIVO</span></div>
                <div className="chat-messages" aria-live="polite">
                  {chatMessages.length === 0 && <p className="chat-empty">Diz olá à malta! As mensagens ficam apenas nesta sala.</p>}
                  {chatMessages.map((message) => <div className={`chat-message ${message.senderId === myOnlineMemberId ? 'chat-message-own' : ''}`} key={message.id}><strong><span className="chat-avatar" aria-hidden="true">{message.senderAvatar}</span>{message.senderName}</strong><span>{message.text}</span><small>{new Date(message.sentAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</small></div>)}
                </div>
                <form className="chat-form" onSubmit={sendChatMessage}>
                  <input aria-label="Mensagem de chat" maxLength={300} value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={onlineRoom.mediaSettings.textChatEnabled ? 'Escreve uma mensagem…' : 'Chat desativado pelo anfitrião'} disabled={!onlineRoom.mediaSettings.textChatEnabled} />
                  <button type="submit" disabled={!chatDraft.trim() || !onlineRoom.mediaSettings.textChatEnabled} aria-label="Enviar mensagem">↑</button>
                </form>
              </aside>
            </div>
            <div className="room-actions-footer"><span>Nomes e mensagens são temporários; os resultados guardados são agregados.</span><button className="button button-secondary" type="button" onClick={leaveOnlineRoom}>Sair da sala</button></div>
          </section>
        )}

        {screen === 'online-match' && onlineRoom && onlineMatch && (
          <section className="content-section match-section online-section">
            {onlineMatch.status === 'playing' ? (
              <>
                <div className="match-header">
                  <div><span className="eyebrow">PARTIDA ONLINE · ESTADO SINCRONIZADO</span><h1>É hora de <span>jogar!</span></h1></div>
                  <div className={`timer-preview ${onlineMatch.secondsLeft <= 10 ? 'timer-warning' : ''}`} aria-live="polite"><small>TEMPO DA RONDA</small><strong>00:{String(onlineMatch.secondsLeft).padStart(2, '0')}</strong><span>Cronómetro do servidor</span></div>
                </div>
                {onlineWinnerInProgress && onlineWinner && (
                  <div className="winner-banner winner-banner-inline" role="status">
                    <span className="winner-trophy">🏆</span>
                    <div><span className="eyebrow">LÍDER ONLINE</span><h1>{onlineWinner.name} <span>está à frente</span></h1></div>
                  </div>
                )}
                <div className="turn-banner">
                  <span className={`team-token team-token-${onlineMatch.teams.find((team) => team.id === onlineMatch.currentTeamId)?.color ?? 'orange'}`}>{onlineMatch.currentTeamId}</span>
                  <div><small>VEZ DA</small><strong>{onlineMatch.currentTeamName}</strong></div>
                  <span className="turn-role">{privateTurn?.teamId === onlineMatch.currentTeamId ? privateTurn.role === 'human-guesses' ? 'Adivinha a pista' : privateTurn.role === 'human-gives' ? 'Dá pistas à equipa' : privateTurn.role === 'watching' ? 'À espera de quem dá as pistas' : 'Os bots estão a jogar' : 'A outra equipa está a jogar'}</span>
                  <span className="turn-card-count">CARTA {Math.min(5, (privateTurn?.itemIndex ?? 0) + 1)} / 5</span>
                </div>
                <div className="match-layout">
                  <div className="preview-card active-game-card">
                    <div className="preview-card-top"><span>{privateTurn?.category.toLocaleUpperCase('pt-PT') ?? 'RONDA'}</span><span>{Math.min(5, (privateTurn?.itemIndex ?? 0) + 1)} / 5</span></div>
                    {privateTurn?.teamId !== onlineMatch.currentTeamId || !privateTurn ? (
                      <div className="online-waiting-card">A equipa está a jogar.<br /><span>Prepara-te para a próxima ronda.</span></div>
                    ) : privateTurn.role === 'human-guesses' ? (
                      <><div className="preview-card-word hint-word">{privateTurn.item?.hint}</div><p>O colega dá a pista. Confirma o acerto ou passa.</p></>
                    ) : privateTurn.role === 'human-gives' ? (
                      <><div className="giver-word-list">{privateTurn.items?.map((item, index) => <div className={`giver-word ${index === privateTurn.itemIndex ? 'giver-word-current' : index < privateTurn.itemIndex ? 'giver-word-done' : ''}`} key={`${privateTurn.category}-${index}`}><span>{index < privateTurn.itemIndex ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{item.word}</strong></div>)}</div><p>Esta carta só é visível para ti. Dá pistas e confirma cada acerto.</p></>
                    ) : privateTurn.role === 'watching' ? (
                      <div className="online-waiting-card">O colega está a dar pistas.<br /><span>A carta fica visível apenas para quem a recebeu.</span></div>
                    ) : <div className="online-waiting-card">Os bots estão a jogar esta ronda…</div>}
                    {privateTurn?.teamId === onlineMatch.currentTeamId && (privateTurn.role === 'human-gives' || privateTurn.role === 'human-guesses') && (
                      <div className="game-actions">
                        <button className="button button-secondary skip-button" type="button" onClick={() => resolveOnlineItem(false)}>Passar <span aria-hidden="true">↷</span></button>
                        <button className="button button-primary" type="button" onClick={() => resolveOnlineItem(true)}>{privateTurn.role === 'human-gives' ? 'A equipa acertou' : 'Acertámos!'} <span aria-hidden="true">✓</span></button>
                      </div>
                    )}
                    {notice && <p className="online-error" role="status">{notice}</p>}
                  </div>
                  <div className="board-panel live-board-panel">
                    <div className="board-panel-heading"><div><span className="eyebrow">TABULEIRO · META NA CASA {onlineMatch.boardLength}</span><strong>Corrida até à meta</strong></div><span className="finish-flag">🏁</span></div>
                    <BoardTrack teams={onlineMatch.teams} boardLength={onlineMatch.boardLength} activeTeamId={onlineMatch.currentTeamId} />
                    <div className="team-score-list">{onlineMatch.teams.map((team) => <div className={`score-row score-${team.color} ${team.id === onlineMatch.currentTeamId ? 'score-active' : ''}`} key={team.id}><span className="score-dot" /><span className="score-team-info"><span>{team.name}</span><span className="score-members">{team.members.map((member) => <span key={member.id} title={member.name} aria-label={member.name}>{member.avatar}</span>)}</span></span><strong>{team.position} / {onlineMatch.boardLength}</strong></div>)}</div>
                  </div>
                </div>
                <div className="online-match-chat">
                  <div className="chat-heading"><span>CHAT DA PARTIDA</span><span className="chat-live"><i /> AO VIVO</span></div>
                  <div className="chat-messages" aria-live="polite">{chatMessages.map((message) => <div className={`chat-message ${message.senderId === myOnlineMemberId ? 'chat-message-own' : ''}`} key={message.id}><strong><span className="chat-avatar" aria-hidden="true">{message.senderAvatar}</span>{message.senderName}</strong><span>{message.text}</span></div>)}</div>
                  <form className="chat-form" onSubmit={sendChatMessage}><input aria-label="Mensagem de chat" maxLength={300} value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder={onlineRoom.mediaSettings.textChatEnabled ? 'Escreve uma mensagem…' : 'Chat desativado pelo anfitrião'} disabled={!onlineRoom.mediaSettings.textChatEnabled} /><button type="submit" disabled={!chatDraft.trim() || !onlineRoom.mediaSettings.textChatEnabled} aria-label="Enviar mensagem">↑</button></form>
                </div>
              </>
            ) : (
              <>
                <div className="winner-banner" role="status"><span className="winner-trophy">🏆</span><div><span className="eyebrow">FIM DA PARTIDA ONLINE</span><h1>{onlineWinner?.name ?? 'Partida terminada'} <span>venceu!</span></h1></div><button className="button button-primary" type="button" onClick={leaveOnlineRoom}>Voltar ao menu <span aria-hidden="true">→</span></button></div>
                <div className="board-panel live-board-panel">
                  <div className="board-panel-heading"><div><span className="eyebrow">TABULEIRO FINAL · META NA CASA {onlineMatch.boardLength}</span><strong>Corrida até à meta</strong></div><span className="finish-flag">🏁</span></div>
                  <BoardTrack teams={onlineMatch.teams} boardLength={onlineMatch.boardLength} activeTeamId={onlineMatch.winnerTeamId ?? 0} />
                </div>
                <div className="final-scores">{[...onlineMatch.teams].sort((left, right) => right.position - left.position).map((team, index) => <div className={`final-score score-${team.color}`} key={team.id}><span>{index + 1}.</span><strong>{team.name}</strong><span>{team.position} casas</span></div>)}</div>
              </>
            )}
          </section>
        )}

        {screen === 'help' && (
          <section className="content-section narrow-section">
            <div className="section-heading"><span className="eyebrow">REGRAS RÁPIDAS</span><h1>Como se <span>joga?</span></h1><p>Explica, adivinha e avança em equipa.</p></div>
            <div className="info-panel">
              <div className="rule-row"><span>01</span><p>Uma pessoa vê uma carta com cinco itens e dá pistas à sua equipa; com bots, os papéis alternam.</p></div>
              <div className="rule-row"><span>02</span><p>A equipa tem 30 segundos. Falar, escrever e fazer mímica são permitidos.</p></div>
              <div className="rule-row"><span>03</span><p>Quem vê a carta confirma cada acerto. Passar não avança; cada acerto vale uma casa.</p></div>
              <div className="rule-row"><span>04</span><p>Ganha a primeira equipa a alcançar ou ultrapassar a casa final.</p></div>
              <p className="demo-disclaimer">Na partida local, os bots jogam automaticamente. As salas online requerem um servidor e uma base de dados MySQL configurados.</p>
            </div>
          </section>
        )}

        {screen === 'credits' && (
          <section className="content-section narrow-section">
            <div className="section-heading"><span className="eyebrow">MAXAKA · VERSÃO INICIAL</span><h1>Jogo bom é <span>jogo junto.</span></h1><p>Um projeto de convívio, palavras e referências de Moçambique.</p></div>
            <div className="info-panel credits-panel">
              <span className="credits-symbol">✳</span>
              <dl className="credits-list">
                <div><dt>Fundador e criador</dt><dd>Ambrósio Rafael de Jesus Chichava</dd></div>
                <div><dt>Desenvolvimento do produto</dt><dd>MAXAKA</dd></div>
              </dl>
              <p className="credits-copyright">© 2026 — MAXAKA</p>
            </div>
          </section>
        )}
      </div>

      {screen === 'home' && (
        <footer className="site-footer">
          <span>© 2026 MAXAKA <span className="footer-dot">●</span> JOGA À TUA MANEIRA</span>
          <nav aria-label="Navegação de rodapé">
            <button type="button" onClick={() => setScreen('help')}>Ajuda</button>
            <button type="button" onClick={() => setScreen('credits')}>Créditos</button>
          </nav>
          <span className="footer-made">FEITO COM <b>♥</b> PARA JOGAR EM CONJUNTO</span>
        </footer>
      )}
    </main>
  )
}

export default App
