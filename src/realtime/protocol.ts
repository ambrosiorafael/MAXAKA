import type { GameItem } from '../game/catalog.ts'

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string; redirectTo?: string }
export type Ack<T> = (result: AckResult<T>) => void

export type RoomMemberView = {
  id: string
  name: string
  avatar: string
  teamId: number
  isBot: boolean
  isHost: boolean
  isOnline: boolean
}

export type RoomStateView = {
  code: string
  status: 'open' | 'playing' | 'finished'
  hostId: string
  teamCount: number
  hintsEnabled: boolean
  mediaSettings: {
    audioEnabled: boolean
    videoEnabled: boolean
    textChatEnabled: boolean
    mimeEnabled: boolean
  }
  members: RoomMemberView[]
}

export type RoomSettingsUpdate = Partial<RoomStateView['mediaSettings']> & {
  hintsEnabled?: boolean
}

export type MatchStateView = {
  status: 'playing' | 'finished'
  endReason: 'winner' | 'cards-exhausted' | null
  turnStatus: 'waiting' | 'active'
  currentTeamId: number
  currentTeamName: string
  starterId: string | null
  secondsLeft: number
  boardLength: number
  winnerTeamId: number | null
  turnIndex: number
  category: string
  teams: Array<{
    id: number
    name: string
    color: string
    position: number
    members: Array<{
      id: string
      name: string
      avatar: string
      isBot: boolean
    }>
  }>
}

export type PrivateTurnView = {
  teamId: number
  role: 'human-gives' | 'human-guesses' | 'watching' | 'automated'
  itemIndex: number
  category: string
  starterId: string | null
  canStart: boolean
  item?: { hint?: string }
  items?: Array<Pick<GameItem, 'word'>>
}

export type ChatMessageView = {
  id: string
  senderId: string
  senderName: string
  senderAvatar: string
  text: string
  sentAt: string
}

export type MediaPeerView = {
  memberId: string
  memberName: string
  memberAvatar: string
}

export type MediaSignal =
  | { type: 'description'; description: { type: 'offer' | 'answer'; sdp: string } }
  | {
    type: 'candidate'
    candidate: {
      candidate: string
      sdpMid?: string | null
      sdpMLineIndex?: number | null
      usernameFragment?: string | null
    }
  }

export type MediaIceServerView = {
  urls: string[]
  username?: string
  credential?: string
  credentialType?: 'password'
}

export type MediaJoinView = { peers: MediaPeerView[]; iceServers: MediaIceServerView[] }

export interface ClientToServerEvents {
  'room:create': (payload: {
    name: string
    avatar: string
    teamCount: number
    hintsEnabled?: boolean
    mediaSettings?: RoomStateView['mediaSettings']
  }, ack: Ack<{ room: RoomStateView; sessionToken: string; memberId: string; serverUrl?: string }>) => void
  'room:join': (payload: { code: string; name: string; avatar: string }, ack: Ack<{ room: RoomStateView; sessionToken: string; memberId: string; serverUrl?: string }>) => void
  'room:team': (payload: { memberId: string; teamId: number }, ack: Ack<{ room: RoomStateView }>) => void
  'room:add-bot': (payload: { teamId: number }, ack: Ack<{ room: RoomStateView }>) => void
  'room:leave': (ack: Ack<{ left: true }>) => void
  'match:start': (ack: Ack<{ started: true }>) => void
  'turn:start': (ack: Ack<{ started: true }>) => void
  'match:resolve': (payload: { correct: boolean }, ack: Ack<{ resolved: true }>) => void
  'chat:send': (payload: { text: string }, ack: Ack<{ sent: true }>) => void
  'media:join': (ack: Ack<MediaJoinView>) => void
  'media:signal': (payload: { toMemberId: string; signal: MediaSignal }, ack: Ack<{ sent: true }>) => void
  'media:leave': (ack: Ack<{ left: true }>) => void
  'room:settings': (payload: RoomSettingsUpdate, ack: Ack<{ room: RoomStateView }>) => void
}

export interface ServerToClientEvents {
  'room:state': (room: RoomStateView) => void
  'match:state': (match: MatchStateView) => void
  'turn:private': (turn: PrivateTurnView) => void
  'chat:message': (message: ChatMessageView) => void
  'room:closed': (payload: { message: string }) => void
  'server:error': (message: string) => void
  'media:peer-joined': (peer: MediaPeerView) => void
  'media:peer-left': (payload: { memberId: string }) => void
  'media:signal': (payload: { from: MediaPeerView; signal: MediaSignal }) => void
  'media:closed': () => void
}
