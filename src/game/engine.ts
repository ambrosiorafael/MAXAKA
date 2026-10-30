import type { GameCard } from './catalog.ts'

export type MatchMember = {
  id: string
  name: string
  avatar: string
  isBot: boolean
}

export type MatchTeam = {
  id: number
  name: string
  color: string
  members: MatchMember[]
  position: number
}

export type ClueRole = 'human-guesses' | 'human-gives' | 'automated'
export type ItemResult = 'pending' | 'correct' | 'skipped'

export type ActiveTurn = {
  teamId: number
  role: ClueRole
  card: GameCard
  itemIndex: number
  results: ItemResult[]
}

export type MatchState = {
  status: 'playing' | 'finished'
  endReason: 'winner' | 'cards-exhausted' | null
  turnStatus: 'waiting' | 'active'
  teams: MatchTeam[]
  deck: GameCard[]
  nextCardIndex: number
  currentTeamIndex: number
  teamTurnsPlayed: Record<number, number>
  secondsLeft: number
  turn: ActiveTurn | null
  winnerTeamId: number | null
  boardLength: number
}

export const TURN_SECONDS = 30
export const DEFAULT_BOARD_LENGTH = 30

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function makeTurn(state: MatchState, teamIndex: number, nextCardIndex: number): ActiveTurn {
  const team = state.teams[teamIndex]
  const played = state.teamTurnsPlayed[team.id] ?? 0
  const hasHuman = team.members.some((member) => !member.isBot)
  const hasBot = team.members.some((member) => member.isBot)

  let role: ClueRole
  if (!hasHuman) role = 'automated'
  else if (!hasBot) role = 'human-gives'
  else role = played % 2 === 0 ? 'human-guesses' : 'human-gives'

  return {
    teamId: team.id,
    role,
    card: state.deck[nextCardIndex],
    itemIndex: 0,
    results: Array.from({ length: 5 }, () => 'pending'),
  }
}

export function startMatch(
  teams: readonly Omit<MatchTeam, 'position'>[],
  cards: readonly GameCard[],
  options: {
    random?: () => number
    boardLength?: number
    usedContentIds?: ReadonlySet<string>
    allowRepeatedItems?: boolean
  } = {},
): MatchState {
  const random = options.random ?? Math.random
  if (teams.length < 2) throw new Error('A partida precisa de pelo menos duas equipas.')
  if (cards.length === 0) throw new Error('Não existem cartas para iniciar a partida.')
  if (teams.some((team) => team.members.length < 2 || team.members.length > 6)) {
    throw new Error('Cada equipa precisa de ter entre 2 e 6 jogadores.')
  }
  if (teams.some((team) => team.members.length === 0)) throw new Error('Todas as equipas precisam de participantes.')

  const reservedContentIds = new Set(options.usedContentIds)
  const shuffledCards = shuffled(cards, random)
  const uniqueDeck = options.allowRepeatedItems ? shuffledCards : shuffledCards.filter((card) => {
    if (card.items.some((item) => reservedContentIds.has(item.id))) return false
    for (const item of card.items) reservedContentIds.add(item.id)
    return true
  })
  const deck = uniqueDeck.length > 0 ? uniqueDeck : shuffled(cards, random)
  const currentTeamIndex = Math.min(teams.length - 1, Math.floor(random() * teams.length))
  const state: MatchState = {
    status: 'playing',
    endReason: null,
    turnStatus: 'waiting',
    teams: teams.map((team) => ({ ...team, members: [...team.members], position: 0 })),
    deck,
    nextCardIndex: 1,
    currentTeamIndex,
    teamTurnsPlayed: Object.fromEntries(teams.map((team) => [team.id, 0])),
    secondsLeft: TURN_SECONDS,
    turn: null,
    winnerTeamId: null,
    boardLength: options.boardLength ?? DEFAULT_BOARD_LENGTH,
  }
  state.turn = makeTurn(state, currentTeamIndex, 0)
  return state
}

export function startCurrentTurn(state: MatchState): MatchState {
  if (state.status !== 'playing' || !state.turn || state.turnStatus !== 'waiting') return state
  return { ...state, turnStatus: 'active', secondsLeft: TURN_SECONDS }
}

export function replaceCurrentTurnCard(state: MatchState, card: GameCard): MatchState {
  if (!state.turn || !state.deck.some((entry) => entry.id === card.id)) return state
  const currentIndex = state.deck.findIndex((entry) => entry.id === state.turn?.card.id)
  const replacementIndex = state.deck.findIndex((entry) => entry.id === card.id)
  if (currentIndex < 0 || replacementIndex < 0) return state
  const deck = [...state.deck]
  ;[deck[currentIndex], deck[replacementIndex]] = [deck[replacementIndex]!, deck[currentIndex]!]
  return {
    ...state,
    deck,
    nextCardIndex: Math.max(state.nextCardIndex, replacementIndex + 1),
    turn: { ...state.turn, card },
  }
}

export function endMatchForCardExhaustion(state: MatchState): MatchState {
  if (state.status !== 'playing') return state
  return {
    ...state,
    status: 'finished',
    endReason: 'cards-exhausted',
    turnStatus: 'waiting',
    secondsLeft: 0,
    turn: null,
    winnerTeamId: null,
  }
}

function advanceTurn(state: MatchState): MatchState {
  if (state.status !== 'playing' || !state.turn) return state
  const finishedTeamId = state.turn.teamId
  const finishedTeamIndex = state.currentTeamIndex
  let nextTeamIndex = (finishedTeamIndex + 1) % state.teams.length
  let attempts = 0

  while (attempts < state.teams.length) {
    const nextTeam = state.teams[nextTeamIndex]
    if (nextTeam && nextTeam.position < state.boardLength) break
    nextTeamIndex = (nextTeamIndex + 1) % state.teams.length
    attempts += 1
  }

  const teamTurnsPlayed = {
    ...state.teamTurnsPlayed,
    [finishedTeamId]: (state.teamTurnsPlayed[finishedTeamId] ?? 0) + 1,
  }

  if (state.nextCardIndex >= state.deck.length) {
    return endMatchForCardExhaustion({ ...state, teamTurnsPlayed })
  }

  const nextState: MatchState = {
    ...state,
    turnStatus: 'waiting',
    nextCardIndex: state.nextCardIndex + 1,
    currentTeamIndex: nextTeamIndex,
    teamTurnsPlayed,
    secondsLeft: TURN_SECONDS,
    turn: null,
  }
  nextState.turn = makeTurn(nextState, nextTeamIndex, state.nextCardIndex)
  return nextState
}

function addMovement(state: MatchState, teamId: number, steps: number): MatchState {
  const teams = state.teams.map((team) =>
    team.id === teamId ? { ...team, position: team.position + steps } : team,
  )
  const finishedTeams = teams.filter((team) => team.position >= state.boardLength)
  const winner = teams.find((team) => team.id === teamId && team.position >= state.boardLength)
  const allFinished = finishedTeams.length === teams.length

  return {
    ...state,
    teams,
    status: allFinished ? 'finished' : state.status,
    endReason: allFinished ? 'winner' : state.endReason,
    winnerTeamId: state.winnerTeamId ?? winner?.id ?? null,
    turn: allFinished ? null : state.turn,
  }
}

export function resolveCurrentItem(state: MatchState, correct: boolean, _random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || state.turnStatus !== 'active' || !state.turn || state.turn.role === 'automated') return state
  if (state.turn.results[state.turn.itemIndex] !== 'pending') return state

  const result: ItemResult = correct ? 'correct' : 'skipped'
  const results = state.turn.results.map((item, index) => index === state.turn?.itemIndex ? result : item)
  const turn = { ...state.turn, results, itemIndex: state.turn.itemIndex + 1 }
  const moved = correct ? addMovement({ ...state, turn }, state.turn.teamId, 1) : { ...state, turn }

  if (moved.status === 'finished') return moved
  if (moved.winnerTeamId && !moved.teams.every((team) => team.position >= state.boardLength)) return advanceTurn(moved)
  if (turn.itemIndex >= turn.results.length) return advanceTurn(moved)
  return moved
}

export function endAutomatedTurn(state: MatchState, correctCount: number, _random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || state.turnStatus !== 'active' || !state.turn || state.turn.role !== 'automated') return state
  const score = Math.max(0, Math.min(5, Math.floor(correctCount)))
  const results: ItemResult[] = Array.from({ length: 5 }, (_, index) => index < score ? 'correct' : 'skipped')
  const moved = addMovement({ ...state, turn: { ...state.turn, results, itemIndex: 5 } }, state.turn.teamId, score)
  if (moved.status === 'finished') return moved
  if (moved.winnerTeamId && !moved.teams.every((team) => team.position >= state.boardLength)) return advanceTurn(moved)
  return advanceTurn(moved)
}

export function tickMatch(state: MatchState, _random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || state.turnStatus !== 'active' || !state.turn || state.turn.role === 'automated') return state
  if (state.secondsLeft <= 1) return advanceTurn({ ...state, secondsLeft: 0 })
  return { ...state, secondsLeft: state.secondsLeft - 1 }
}

export function currentTeam(state: MatchState): MatchTeam | undefined {
  return state.teams[state.currentTeamIndex]
}

export function currentItemResult(state: MatchState): ItemResult | undefined {
  return state.turn?.results[state.turn.itemIndex]
}
