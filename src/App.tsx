import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import './App.css'
import BoardTrack from './components/BoardTrack.tsx'
import { avatarCategories, avatarOptions, defaultAvatar, isAvatar } from './game/avatars.ts'
import { readLocalUsedContentIds, recordLocalCardUsage } from './game/cardHistory.ts'
import { localCards } from './game/catalog.ts'
import {
  currentTeam,
  endAutomatedTurn,
  resolveCurrentItem,
  startCurrentTurn,
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

type Screen = 'home' | 'profile' | 'mode' | 'setup' | 'match' | 'online-room' | 'online-match' | 'help' | 'credits' | 'support' | 'helpdesk'
type OnlineAction = 'create' | 'join' | null
type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>
const configuredRealtimeServer = import.meta.env.VITE_SERVER_URL?.trim()
  || (import.meta.env.PROD ? 'https://api.maxaka.com' : undefined)
const RoomMedia = lazy(() => import('./components/RoomMedia.tsx'))
const supportCategories = [
  'Conta e autenticação',
  'Salas e convites',
  'Problemas durante as partidas',
  'Chat e áudio',
  'Perguntas e respostas',
  'Pagamentos e apoio financeiro',
  'Erros técnicos',
  'Sugestões de melhoria',
  'Outros',
] as const
const supportWhatsAppUrl = 'https://wa.me/258845309072?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20jogo%20MAXAKA.'
const supportPhoneNumber = '+258 845 309 072'
const supportFAQs = [
  { question: 'Preciso de criar uma conta?', answer: 'Não. Podes jogar partidas locais sem conta. Nas salas online, o teu nome e perfil são temporários e associados à sala.' },
  { question: 'Como se joga uma partida?', answer: 'Uma pessoa dá pistas para a equipa adivinhar os cinco itens da carta em 30 segundos. Cada acerto avança uma casa; passar não avança.' },
  { question: 'Como crio uma sala e convido amigos?', answer: 'Escolhe “Jogar online” e cria uma sala. Partilha o código de seis caracteres com os teus amigos para entrarem.' },
  { question: 'Como entro numa sala?', answer: 'Escolhe “Jogar online”, indica o código recebido e o teu nome para entrar na sala.' },
  { question: 'O que faço se o chat não funcionar?', answer: 'Confirma que o anfitrião não desativou o chat nas permissões da sala e que a ligação à Internet está ativa.' },
  { question: 'Como ativo o áudio?', answer: 'Entra na chamada da sala e ativa o microfone. O navegador pedirá autorização; permite o acesso apenas se quiseres. O áudio é ponto a ponto e algumas redes precisam de TURN.' },
  { question: 'O jogo está lento ou não consigo entrar. O que faço?', answer: 'Atualiza a página, verifica a ligação e confirma o código da sala. Se o problema continuar, contacta o suporte e descreve o que aconteceu.' },
  { question: 'Como envio uma captura de ecrã ao suporte?', answer: 'Prepara a mensagem no formulário e, depois de abrir o WhatsApp, anexa a imagem diretamente na conversa.' },
  { question: 'Como faço um apoio financeiro?', answer: 'Consulta a secção “Apoiar o MAXAKA” para veres os métodos disponíveis. Se tiveres dúvidas, podes contactar o suporte pelo WhatsApp.' },
] as const

const supportMethods = [
  { id: 'mpesa-sonia', name: 'M-Pesa', logo: '/payment-methods/mpesa.png', number: '845309072', holder: 'Sonia M--', detail: 'Número M-Pesa' },
  { id: 'emola-ambrosio', name: 'eMola', logo: '/payment-methods/emola.png', number: '864001519', holder: 'Ambrósio Rafael', detail: 'Número eMola' },
  { id: 'bim-ambrosio', name: 'Millennium BIM', logo: '/payment-methods/millennium-bim.png', number: '118769129', holder: 'Ambrósio Rafael', detail: 'Número de conta' },
] as const

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

function HintSetting({
  enabled,
  onChange,
  disabled = false,
  description,
}: {
  enabled: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  description?: string
}) {
  return (
    <div className="hint-setting">
      <div className="hint-setting-copy">
        <strong>Pistas</strong>
        <span>{description ?? (enabled ? 'Os jogadores podem ver pistas durante a partida.' : 'Não será apresentada nenhuma pista durante a partida.')}</span>
      </div>
      <div className="hint-setting-options" role="group" aria-label="Configuração de pistas">
        <button
          className={`hint-setting-option ${enabled ? 'hint-setting-option-active' : ''}`}
          type="button"
          aria-pressed={enabled}
          disabled={disabled}
          onClick={() => onChange(true)}
        >
          <span aria-hidden="true">💡</span> Activadas
        </button>
        <button
          className={`hint-setting-option ${!enabled ? 'hint-setting-option-active' : ''}`}
          type="button"
          aria-pressed={!enabled}
          disabled={disabled}
          onClick={() => onChange(false)}
        >
          <span aria-hidden="true">🚫</span> Desactivadas
        </button>
      </div>
    </div>
  )
}

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
  const [supportSubject, setSupportSubject] = useState('')
  const [supportCategory, setSupportCategory] = useState<(typeof supportCategories)[number]>(supportCategories[0])
  const [supportDescription, setSupportDescription] = useState('')
  const [supportScreenshotName, setSupportScreenshotName] = useState('')
  const [preparedSupportUrl, setPreparedSupportUrl] = useState('')
  const [supportCenterNotice, setSupportCenterNotice] = useState('')
  const [supportPhoneNotice, setSupportPhoneNotice] = useState('')
  const [onlineAction, setOnlineAction] = useState<OnlineAction>(null)
  const [playerName, setPlayerName] = useState('')
  const [avatar, setAvatar] = useState(loadSavedAvatar)
  const [savedAvatar, setSavedAvatar] = useState(loadSavedAvatar)
  const [avatarCategoryId, setAvatarCategoryId] = useState(avatarCategories[0].id)
  const [avatarNotice, setAvatarNotice] = useState('')
  const [supportNotice, setSupportNotice] = useState('')
  const [copiedSupportMethod, setCopiedSupportMethod] = useState<string | null>(null)
  const [teamCount, setTeamCount] = useState(2)
  const [createHintsEnabled, setCreateHintsEnabled] = useState(false)
  const [localHintsEnabled, setLocalHintsEnabled] = useState(false)
  const [shownHintKey, setShownHintKey] = useState('')
  const [createRoomSettings, setCreateRoomSettings] = useState<RoomStateView['mediaSettings']>({
    audioEnabled: true,
    videoEnabled: false,
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
  const [turnStarting, setTurnStarting] = useState(false)
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
  const onlinePrivateTurn = onlineMatch && privateTurn
    && (privateTurn.turnIndex === undefined || privateTurn.turnIndex === onlineMatch.turnIndex)
    ? privateTurn
    : null
  const localHintKey = match && activeTurn
    ? `local:${activeTurn.card.id}:${activeTurn.teamId}:${match.teamTurnsPlayed[activeTurn.teamId] ?? 0}:${activeTurn.itemIndex}`
    : ''
  const onlineHintKey = onlineMatch && onlinePrivateTurn
    ? `online:${onlineMatch.turnIndex}:${onlinePrivateTurn.teamId}:${onlinePrivateTurn.itemIndex}`
    : ''
  const onlineTeamCounts = onlineRoom
    ? Array.from({ length: onlineRoom.teamCount }, (_, index) => onlineRoom.members.filter((member) => member.teamId === index + 1).length)
    : []
  const canStartOnline = onlineTeamCounts.length > 1 && onlineTeamCounts.every((count) => count >= 2 && count <= 6)
  const onlineWinner = onlineMatch?.teams.find((team) => team.id === onlineMatch.winnerTeamId)
  const onlineStarterName = onlineRoom?.members.find((member) => member.id === onlineMatch?.starterId)?.name
  const localWinner = match?.winnerTeamId !== null ? match?.teams.find((team) => team.id === match.winnerTeamId) : null
  const onlineWinnerInProgress = onlineMatch?.winnerTeamId !== null && onlineMatch?.teams.some((team) => team.position < onlineMatch.boardLength)
  const localWinnerInProgress = match?.winnerTeamId !== null && match?.teams.some((team) => team.position < match.boardLength)
  const selectedAvatarCategory = avatarCategories.find((category) => category.id === avatarCategoryId) ?? avatarCategories[0]

  useEffect(() => {
    const current = matchRef.current
    if (!current || current.status !== 'playing' || current.turnStatus !== 'active' || current.turn?.role === 'automated') return
    const timer = window.setInterval(() => {
      const currentMatch = matchRef.current
      if (currentMatch) setLocalMatch(tickMatch(currentMatch))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [match?.status, match?.turnStatus, match?.turn?.role])

  useEffect(() => {
    const current = matchRef.current
    if (!current || current.status !== 'playing' || current.turnStatus !== 'active' || current.turn?.role !== 'automated') return
    const cardId = current.turn.card.id
    const teamId = current.turn.teamId
    const turnsPlayed = current.teamTurnsPlayed[teamId] ?? 0
    const teamIndex = current.currentTeamIndex
    const timeout = window.setTimeout(() => {
      const simulatedCorrectCount = 1 + ((cardId.length + teamIndex + turnsPlayed) % 4)
      const currentMatch = matchRef.current
      if (currentMatch) setLocalMatch(endAutomatedTurn(currentMatch, simulatedCorrectCount))
    }, 2200)
    return () => window.clearTimeout(timeout)
  }, [match?.status, match?.turnStatus, match?.turn?.role, match?.turn?.card.id, match?.currentTeamIndex, match?.teamTurnsPlayed])

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
    const existingClient = realtimeRef.current
    if (existingClient?.connected) return existingClient
    existingClient?.disconnect()
    realtimeRef.current = null
    setRealtime(null)

    const token = sessionStorage.getItem('maxaka.session')
    const serverUrl = import.meta.env.DEV
      ? configuredRealtimeServer
      : sessionStorage.getItem('maxaka.server') || configuredRealtimeServer
    const client = io(serverUrl, {
      auth: token ? { sessionToken: token } : {},
      reconnection: true,
      reconnectionDelay: 800,
    })
    client.on('connect', () => {
      setNotice('')
      setRealtime(client)
      setMyOnlineMemberId(sessionStorage.getItem('maxaka.member') ?? '')
    })
    client.on('room:state', (room) => {
      setOnlineRoom(room)
      setScreen(room.status === 'open' ? 'online-room' : 'online-match')
    })
    client.on('match:state', (matchState) => {
      setOnlineMatch(matchState)
      setPrivateTurn((current) => current && (
        current.turnIndex === undefined
          ? current.teamId === matchState.currentTeamId
          : current.turnIndex === matchState.turnIndex
      ) ? current : null)
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
    client.on('connect_error', (error) => {
      console.error('Falha ao ligar à sala online:', error)
      setNotice('Não foi possível ligar à sala. Tenta novamente.')
    })
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
          { name: displayName, avatar, teamCount, hintsEnabled: createHintsEnabled, mediaSettings: createRoomSettings },
          (error, result) => {
            if (error || !result) {
              setNotice('Não foi possível criar a sala. Verifica a ligação e tenta novamente.')
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
              setNotice('Não foi possível entrar na sala. Verifica o código e tenta novamente.')
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

  function setLocalMatch(nextMatch: MatchState | null): boolean {
    const previousCardId = matchRef.current?.turn?.card.id
    const nextCard = nextMatch?.turn?.card
    if (nextCard && nextCard.id !== previousCardId) {
      try {
        recordLocalCardUsage(window.localStorage, nextCard, localCards)
      } catch (error) {
        console.error('Falha ao guardar o histórico local de conteúdos:', error)
        setNotice('Não foi possível guardar o histórico das cartas neste navegador.')
        return false
      }
    }
    matchRef.current = nextMatch
    setMatch(nextMatch)
    return true
  }

  function startDemo() {
    if (!canStartDemo) {
      setNotice('Cada equipa precisa de ter entre 2 e 6 jogadores.')
      return
    }
    try {
      const usedContentIds = readLocalUsedContentIds(window.localStorage, localCards)
      setNotice('')
      setShownHintKey('')
      try {
        if (!setLocalMatch(startMatch(teams, localCards, { usedContentIds }))) return
      } catch (error) {
        if (error instanceof Error && error.message.includes('conteúdos inéditos')) {
          setNotice('Todos os conteúdos deste navegador já foram usados. Nenhuma palavra será repetida; adiciona conteúdos novos para iniciar outra partida.')
          return
        }
        throw error
      }
      setScreen('match')
    } catch (error) {
      console.error('Falha ao iniciar a partida local:', error)
      setNotice('Não foi possível carregar o histórico de cartas neste navegador.')
    }
  }

  function startLocalTurn() {
    const currentMatch = matchRef.current
    if (currentMatch) setLocalMatch(startCurrentTurn(currentMatch))
  }

  function resolveItem(correct: boolean) {
    const currentMatch = matchRef.current
    if (currentMatch) setLocalMatch(resolveCurrentItem(currentMatch, correct))
  }

  function restartMatch() {
    try {
      const usedContentIds = readLocalUsedContentIds(window.localStorage, localCards)
      setNotice('')
      setShownHintKey('')
      setLocalMatch(startMatch(teams, localCards, { usedContentIds }))
    } catch (error) {
      console.error('Falha ao reiniciar a partida local:', error)
      setNotice(error instanceof Error && error.message.includes('conteúdos inéditos')
        ? 'Todos os conteúdos deste navegador já foram usados. Nenhuma palavra será repetida; adiciona conteúdos novos para iniciar outra partida.'
        : 'Não foi possível carregar o histórico de conteúdos neste navegador.')
    }
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
    setNotice('')
    realtime.timeout(30000).emit('match:start', (error, result) => {
      if (error || !result) setNotice('O servidor não respondeu ao pedido de início.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function startOnlineTurn() {
    if (!realtime || turnStarting) return
    setTurnStarting(true)
    realtime.timeout(5000).emit('turn:start', (error, result) => {
      setTurnStarting(false)
      if (error || !result) setNotice('Não foi possível iniciar a jogada. Tenta novamente.')
      else if (!result.ok) setNotice(result.error)
      else setNotice('')
    })
  }

  function changeOnlineHints(enabled: boolean) {
    if (!realtime) return
    realtime.timeout(5000).emit('room:settings', { hintsEnabled: enabled }, (error, result) => {
      if (error || !result) setNotice('A sala não respondeu à alteração das pistas.')
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

  async function copySupportPhoneNumber() {
    try {
      await navigator.clipboard.writeText(supportPhoneNumber.replaceAll(' ', ''))
      setSupportPhoneNotice('Número copiado.')
    } catch {
      setSupportPhoneNotice('Não foi possível copiar automaticamente. Seleciona o número e copia-o manualmente.')
    }
  }

  function prepareSupportMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const message = [
      'Olá! Preciso de ajuda com o jogo MAXAKA.',
      `Assunto: ${supportSubject.trim()}`,
      `Categoria: ${supportCategory}`,
      `Descrição: ${supportDescription.trim()}`,
      supportScreenshotName ? 'Tenho uma captura de ecrã para anexar nesta conversa.' : '',
    ].filter(Boolean).join('\n')
    setPreparedSupportUrl(`https://wa.me/258845309072?text=${encodeURIComponent(message)}`)
    setSupportCenterNotice('Mensagem preparada. Abre o WhatsApp pelo link abaixo, revê e envia a mensagem. O MAXAKA não recebe nem confirma o envio.')
  }

  function selectSupportScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreparedSupportUrl('')
    if (!file) {
      setSupportScreenshotName('')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      event.target.value = ''
      setSupportScreenshotName('')
      setSupportCenterNotice('Escolhe uma imagem PNG, JPEG ou WebP com até 5 MB.')
      return
    }
    setSupportScreenshotName(file.name)
    setSupportCenterNotice('')
  }

  async function copySupportNumber(methodId: string, number: string) {
    try {
      await navigator.clipboard.writeText(number)
      setCopiedSupportMethod(methodId)
      setSupportNotice('Número copiado. Obrigado por apoiares o MAXAKA!')
    } catch {
      setCopiedSupportMethod(null)
      setSupportNotice('Não foi possível copiar automaticamente. Podes selecionar e copiar o número manualmente.')
    }
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
    else if (screen === 'mode' || screen === 'help' || screen === 'credits' || screen === 'support' || screen === 'helpdesk') setScreen('home')
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
            <div className="section-footnote"><span className="status-dot" /> Cria uma sala privada ou entra com o código de convite.</div>
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
                  <HintSetting enabled={createHintsEnabled} onChange={setCreateHintsEnabled} />
                  <span className="field-label">Regras de comunicação da sala</span>
                  <div className="create-room-settings">
                    {([
                      ['audioEnabled', 'Permitir áudio'],
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
                  <div className="field-caption">Chamadas disponíveis apenas em áudio, ponto a ponto e limitadas a 6 pessoas por sala. As permissões ficam bloqueadas quando a partida começar.</div>
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
            <HintSetting enabled={localHintsEnabled} onChange={setLocalHintsEnabled} />
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
                    <div><span className="eyebrow">FIM DA PARTIDA</span><h1>{match.endReason === 'cards-exhausted' ? 'Conteúdos esgotados' : `${localWinner?.name ?? 'Partida terminada'} venceu!`}</h1>{match.endReason === 'cards-exhausted' && <p>Todos os conteúdos disponíveis neste navegador já foram usados. Nenhuma palavra será repetida; adiciona conteúdos novos para continuar.</p>}</div>
                    <button className="button button-primary" type="button" onClick={restartMatch}>Jogar novamente <span aria-hidden="true">↻</span></button>
                  </div>
                ) : (
                  <div className="match-header">
                    <div><span className="eyebrow">PARTIDA LOCAL · REGRAS EM EXECUÇÃO</span><h1>É hora de <span>jogar!</span></h1></div>
                    <div className={`timer-preview ${match.secondsLeft <= 10 ? 'timer-warning' : ''}`} aria-live="polite">
                      <small>TEMPO DA RONDA</small><strong>00:{String(match.secondsLeft).padStart(2, '0')}</strong><span>{match.turnStatus === 'waiting' ? 'À espera do START' : activeTurn?.role === 'automated' ? 'Bots a jogar' : 'Cronómetro ativo'}</span>
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
                    <span className="turn-role">{activeTurn.role === 'human-guesses' ? localHintsEnabled ? 'Adivinha com pistas opcionais' : 'Adivinha sem pistas' : activeTurn.role === 'human-gives' ? 'Dá pistas à tua equipa' : 'A equipa de bots está a jogar'}</span>
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
                          {localHintsEnabled ? shownHintKey === localHintKey ? (
                            <div className="preview-card-word hint-word">{activeItem?.hint}</div>
                          ) : (
                            <button className="button button-secondary reveal-hint-button" type="button" onClick={() => setShownHintKey(localHintKey)}>
                              Ver pista <span aria-hidden="true">💡</span>
                            </button>
                          ) : (
                            <div className="online-waiting-card">Pistas desactivadas nesta partida.</div>
                          )}
                          <p>{localHintsEnabled ? 'O bot dá a pista. Adivinha o item e confirma quando a equipa acertar.' : 'Adivinha o item sem pistas e confirma quando a equipa acertar.'}</p>
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
                      {match.turnStatus === 'waiting' ? (
                        <div className="game-actions">
                          <button className="button button-primary button-start-turn" type="button" onClick={startLocalTurn}>
                            START — INICIAR JOGADA <span aria-hidden="true">→</span>
                          </button>
                        </div>
                      ) : activeTurn.role !== 'automated' && (
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
                <HintSetting
                  enabled={onlineRoom.hintsEnabled}
                  onChange={changeOnlineHints}
                  disabled={onlineRoom.status !== 'open' || onlineRoom.hostId !== myOnlineMemberId}
                  description={onlineRoom.status === 'open'
                    ? onlineRoom.hostId === myOnlineMemberId
                      ? onlineRoom.hintsEnabled ? 'Os jogadores poderão ver pistas durante a partida.' : 'Nenhuma pista será apresentada durante a partida.'
                      : `O anfitrião escolheu: ${onlineRoom.hintsEnabled ? 'activadas' : 'desactivadas'}.`
                    : `Configuração bloqueada: ${onlineRoom.hintsEnabled ? 'activadas' : 'desactivadas'}.`}
                />
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
                              {!member.isHost && !member.isBot && <span className="guest-chip">CONVIDADO</span>}
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
                  <div className={`timer-preview ${onlineMatch.turnStatus === 'active' && onlineMatch.secondsLeft <= 10 ? 'timer-warning' : ''}`} aria-live="polite"><small>TEMPO DA RONDA</small><strong>00:{String(onlineMatch.secondsLeft).padStart(2, '0')}</strong><span>{onlineMatch.turnStatus === 'waiting' ? 'À espera do START' : 'Cronómetro sincronizado'}</span></div>
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
                  <span className="turn-role">{onlineMatch.turnStatus === 'waiting' ? `Aguarda START${onlineStarterName ? ` de ${onlineStarterName}` : ''}` : onlinePrivateTurn?.teamId === onlineMatch.currentTeamId ? onlinePrivateTurn.role === 'human-guesses' ? onlineRoom.hintsEnabled ? 'Adivinha com pistas opcionais' : 'Adivinha sem pistas' : onlinePrivateTurn.role === 'human-gives' ? 'Dá pistas à equipa' : onlinePrivateTurn.role === 'watching' ? 'À espera de quem dá as pistas' : 'Os bots estão a jogar' : 'A outra equipa está a jogar'}</span>
                  <span className="turn-card-count">CARTA {Math.min(5, (onlinePrivateTurn?.itemIndex ?? 0) + 1)} / 5</span>
                </div>
                <div className="match-layout">
                  <div className="preview-card active-game-card">
                    <div className="preview-card-top"><span>{onlinePrivateTurn?.category.toLocaleUpperCase('pt-PT') ?? 'RONDA'}</span><span>{Math.min(5, (onlinePrivateTurn?.itemIndex ?? 0) + 1)} / 5</span></div>
                    {onlineMatch.turnStatus === 'waiting' && onlinePrivateTurn?.items ? (
                      <><div className="giver-word-list">{onlinePrivateTurn.items.map((item, index) => <div className="giver-word" key={`${onlinePrivateTurn.category}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.word}</strong></div>)}</div><p>Cartas visíveis para acompanhar a jogada. Aguarda o início do cronómetro.</p></>
                    ) : onlineMatch.turnStatus === 'waiting' ? (
                      <div className="online-waiting-card">A jogada está preparada.<br /><span>{onlineStarterName ? `${onlineStarterName} inicia quando estiver pronto.` : 'Aguarda o jogador responsável pelo START.'}</span></div>
                    ) : onlinePrivateTurn?.teamId !== onlineMatch.currentTeamId || !onlinePrivateTurn ? (
                      onlinePrivateTurn?.items ? (
                        <><div className="giver-word-list">{onlinePrivateTurn.items.map((item, index) => {
                        const result = onlinePrivateTurn.results?.[index] ?? 'pending'
                        return <div className={`giver-word ${index === onlinePrivateTurn.itemIndex ? 'giver-word-current' : ''} ${result === 'correct' || result === 'skipped' ? 'giver-word-done' : ''}`} key={`${onlinePrivateTurn.category}-${index}`}><span>{result === 'correct' ? '✓' : result === 'skipped' ? '↷' : String(index + 1).padStart(2, '0')}</span><strong>{item.word}</strong></div>
                        })}</div><p>Acompanha a carta da equipa em jogo.</p></>
                      ) : <div className="online-waiting-card">A equipa está a jogar.<br /><span>Prepara-te para a próxima ronda.</span></div>
                    ) : onlinePrivateTurn.role === 'human-guesses' ? (
                      <>
                        {onlineRoom.hintsEnabled ? shownHintKey === onlineHintKey ? (
                        <div className="preview-card-word hint-word">{onlinePrivateTurn.item?.hint}</div>
                        ) : (
                          <button className="button button-secondary reveal-hint-button" type="button" onClick={() => setShownHintKey(onlineHintKey)}>
                            Ver pista <span aria-hidden="true">💡</span>
                          </button>
                        ) : (
                          <div className="online-waiting-card">Pistas desactivadas nesta partida.</div>
                        )}
                        <p>{onlineRoom.hintsEnabled ? 'O colega dá a pista. Confirma o acerto ou passa.' : 'Adivinha o item sem pistas. Confirma o acerto ou passa.'}</p>
                      </>
                    ) : onlinePrivateTurn.role === 'human-gives' ? (
                      <><div className="giver-word-list">{onlinePrivateTurn.items?.map((item, index) => {
                        const result = onlinePrivateTurn.results?.[index] ?? 'pending'
                        return <div className={`giver-word ${index === onlinePrivateTurn.itemIndex ? 'giver-word-current' : ''} ${result === 'correct' || result === 'skipped' ? 'giver-word-done' : ''}`} key={`${onlinePrivateTurn.category}-${index}`}><span>{result === 'correct' ? '✓' : result === 'skipped' ? '↷' : String(index + 1).padStart(2, '0')}</span><strong>{item.word}</strong></div>
                      })}</div><p>Esta carta só é visível para ti. Dá pistas e confirma cada acerto.</p></>
                    ) : onlinePrivateTurn.role === 'watching' ? (
                      <div className="online-waiting-card">O colega está a dar pistas.<br /><span>A equipa adversária vê os conteúdos para fiscalizar.</span></div>
                    ) : <div className="online-waiting-card">Os bots estão a jogar esta ronda…</div>}
                    {onlineMatch.turnStatus === 'waiting' && onlineMatch.starterId === myOnlineMemberId && (
                      <div className="game-actions">
                        <button className="button button-primary button-start-turn" type="button" disabled={turnStarting} onClick={startOnlineTurn}>
                          {turnStarting ? 'A INICIAR…' : 'START — INICIAR JOGADA'} <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    )}
                    {onlineMatch.turnStatus === 'active' && onlinePrivateTurn?.teamId === onlineMatch.currentTeamId && (onlinePrivateTurn.role === 'human-gives' || onlinePrivateTurn.role === 'human-guesses') && (
                      <div className="game-actions">
                        <button className="button button-secondary skip-button" type="button" onClick={() => resolveOnlineItem(false)}>Passar <span aria-hidden="true">↷</span></button>
                        <button className="button button-primary" type="button" onClick={() => resolveOnlineItem(true)}>{onlinePrivateTurn.role === 'human-gives' ? 'A equipa acertou' : 'Acertámos!'} <span aria-hidden="true">✓</span></button>
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
                <div className="winner-banner" role="status">
                  <span className="winner-trophy">{onlineMatch.endReason === 'cards-exhausted' ? '📚' : '🏆'}</span>
                  <div>
                    <span className="eyebrow">FIM DA PARTIDA ONLINE</span>
                    <h1>{onlineMatch.endReason === 'cards-exhausted' ? 'Baralho desta partida terminou' : `${onlineWinner?.name ?? 'Partida terminada'} venceu!`}</h1>
                    {onlineMatch.endReason === 'cards-exhausted' && <p>As cartas desta partida foram usadas. O anfitrião pode iniciar outra partida com um baralho novo.</p>}
                  </div>
                  {onlineRoom.hostId === myOnlineMemberId ? (
                    <button className="button button-primary" type="button" onClick={startOnlineGame}>Nova partida <span aria-hidden="true">↻</span></button>
                  ) : (
                    <button className="button button-primary" type="button" onClick={leaveOnlineRoom}>Voltar ao menu <span aria-hidden="true">→</span></button>
                  )}
                </div>
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
              <p className="demo-disclaimer">Na partida local, os bots jogam automaticamente. Nas salas online, podes jogar com amigos usando o código da sala.</p>
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

        {screen === 'helpdesk' && (
          <section className="content-section helpdesk-section">
            <div className="section-heading">
              <span className="eyebrow">MAXAKA · ESTAMOS AQUI PARA AJUDAR</span>
              <h1>Suporte</h1>
              <p>Entra em contacto diretamente ou consulta as respostas às dúvidas mais comuns.</p>
            </div>

            <div className="support-contact-grid">
              <article className="info-panel support-contact-card">
                <span className="support-contact-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" /><path d="M9 8.5c.4 2.3 1.7 3.6 4 4" /></svg>
                </span>
                <h2>WhatsApp</h2>
                <p>Envia uma mensagem ao suporte MAXAKA.</p>
                <strong className="support-contact-number">{supportPhoneNumber}</strong>
                <a className="button button-primary" href={supportWhatsAppUrl} target="_blank" rel="noreferrer">
                  Contactar pelo WhatsApp <span aria-hidden="true">↗</span>
                </a>
              </article>
              <article className="info-panel support-contact-card">
                <span className="support-contact-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M7 3H4.8A1.8 1.8 0 0 0 3 4.8C3 13.7 10.3 21 19.2 21a1.8 1.8 0 0 0 1.8-1.8V17l-5-2-1.5 2a14 14 0 0 1-6.5-6.5L10 9 8 4 7 3Z" /></svg>
                </span>
                <h2>Chamada telefónica</h2>
                <p>Se preferires, liga diretamente para o suporte.</p>
                <strong className="support-contact-number">{supportPhoneNumber}</strong>
                <div className="support-contact-actions">
                  <a className="button button-primary" href="tel:+258845309072">Ligar para o suporte <span aria-hidden="true">↗</span></a>
                  <button className="button button-secondary" type="button" onClick={() => void copySupportPhoneNumber()}>Copiar número</button>
                </div>
                <p className="support-contact-notice" role="status" aria-live="polite">{supportPhoneNotice}</p>
              </article>
            </div>

            <div className="support-center-grid">
              <section className="info-panel support-request-panel">
                <h2>Contactar o suporte</h2>
                <p>Preenche os dados para preparar uma mensagem no WhatsApp. Revê e envia-a na aplicação.</p>
                <form className="support-request-form" onSubmit={prepareSupportMessage}>
                  <label htmlFor="support-subject">Assunto do pedido</label>
                  <input id="support-subject" name="subject" maxLength={100} required value={supportSubject} onChange={(event) => { setSupportSubject(event.target.value); setPreparedSupportUrl(''); setSupportCenterNotice('') }} placeholder="Resume o problema" />
                  <label htmlFor="support-category">Categoria do problema</label>
                  <select id="support-category" name="category" value={supportCategory} onChange={(event) => { const category = supportCategories.find((candidate) => candidate === event.target.value); if (category) setSupportCategory(category); setPreparedSupportUrl(''); setSupportCenterNotice('') }}>
                    {supportCategories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <label htmlFor="support-description">Descrição detalhada</label>
                  <textarea id="support-description" name="description" maxLength={3000} required value={supportDescription} onChange={(event) => { setSupportDescription(event.target.value); setPreparedSupportUrl(''); setSupportCenterNotice('') }} placeholder="Conta-nos o que aconteceu e os passos para reproduzir o problema." rows={5} />
                  <label htmlFor="support-screenshot">Captura de ecrã (opcional)</label>
                  <input id="support-screenshot" name="screenshot" type="file" accept="image/png,image/jpeg,image/webp" onChange={selectSupportScreenshot} />
                  <span className="support-form-hint">
                    {supportScreenshotName ? `Imagem selecionada: ${supportScreenshotName}. Anexa-a manualmente no WhatsApp depois de abrir a conversa.` : 'PNG, JPEG ou WebP, até 5 MB. A imagem não é enviada por esta página; podes anexá-la no WhatsApp.'}
                  </span>
                  <button className="button button-primary" type="submit">Preparar mensagem para WhatsApp <span aria-hidden="true">↗</span></button>
                </form>
                {supportCenterNotice && <p className="support-form-notice" role="status" aria-live="polite">{supportCenterNotice}</p>}
                {preparedSupportUrl && <a className="support-prepared-link" href={preparedSupportUrl} target="_blank" rel="noreferrer">Abrir WhatsApp com mensagem preparada <span aria-hidden="true">↗</span></a>}
              </section>

              <section className="info-panel support-faq-panel">
                <h2>Perguntas frequentes</h2>
                <div className="support-faq-list">
                  {supportFAQs.map((faq) => (
                    <details className="support-faq-item" key={faq.question}>
                      <summary>{faq.question}</summary>
                      <p>{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {screen === 'support' && (
          <section className="content-section support-section">
            <div className="section-heading">
              <span className="eyebrow">MAXAKA · APOIO VOLUNTÁRIO</span>
              <h1>Apoiar o <span>MAXAKA</span></h1>
              <p>O teu contributo ajuda a desenvolver o jogo, manter os servidores e criar novas funcionalidades. Apoiar é totalmente voluntário.</p>
            </div>
            <div className="support-methods">
              {supportMethods.map((method) => (
                <article className="info-panel support-card" key={method.id}>
                  <div className="support-method-brand">
                    <img className="support-method-logo" src={method.logo} alt="" />
                    <span className="eyebrow">{method.name}</span>
                  </div>
                  <span className="support-detail">{method.detail}</span>
                  <strong className="support-number">{method.number}</strong>
                  <p className="support-holder">Titular: <strong>{method.holder}</strong></p>
                  <button className="button button-secondary support-copy" type="button" onClick={() => void copySupportNumber(method.id, method.number)}>
                    {copiedSupportMethod === method.id ? 'Copiado' : 'Copiar número'}
                  </button>
                </article>
              ))}
            </div>
            <p className="support-notice" role="status" aria-live="polite">{supportNotice}</p>
            <div className="info-panel support-instructions">
              <h2>Como apoiar</h2>
              <ol>
                <li>Escolhe um dos métodos e copia o respetivo número.</li>
                <li>Abre a aplicação eMola, M-Pesa ou Millennium BIM e inicia uma transferência ou envio de dinheiro.</li>
                <li>Introduz o número ou conta, confirma o nome do titular apresentado pela aplicação e escolhe o valor que queres enviar.</li>
                <li>Confirma a operação diretamente na aplicação do teu banco ou serviço de pagamentos.</li>
              </ol>
            </div>
            <p className="support-thanks">Obrigado por ajudares o MAXAKA a crescer. Cada apoio faz diferença. <span aria-hidden="true">♥</span></p>
          </section>
        )}
      </div>

      {screen === 'home' && (
        <footer className="site-footer">
          <span>© 2026 MAXAKA <span className="footer-dot">●</span> JOGA À TUA MANEIRA</span>
          <nav aria-label="Navegação de rodapé">
            <button type="button" onClick={() => setScreen('help')}>Ajuda</button>
            <button type="button" onClick={() => { setPreparedSupportUrl(''); setSupportCenterNotice(''); setSupportPhoneNotice(''); setScreen('helpdesk') }}>Suporte</button>
            <button type="button" onClick={() => setScreen('credits')}>Créditos</button>
            <button type="button" onClick={() => { setSupportNotice(''); setCopiedSupportMethod(null); setScreen('support') }}>Apoiar o MAXAKA</button>
          </nav>
          <span className="footer-made">FEITO COM <b>♥</b> PARA JOGAR EM CONJUNTO</span>
        </footer>
      )}
    </main>
  )
}

export default App
