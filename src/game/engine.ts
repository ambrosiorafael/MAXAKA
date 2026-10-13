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
export const DEFAULT_BOARD_LENGTH = 25

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
  options: { random?: () => number; boardLength?: number } = {},
): MatchState {
  const random = options.random ?? Math.random
  if (teams.length < 2) throw new Error('A partida precisa de pelo menos duas equipas.')
  if (cards.length === 0) throw new Error('Não existem cartas para iniciar a partida.')
  if (teams.some((team) => team.members.length < 2 || team.members.length > 6)) {
    throw new Error('Cada equipa precisa de ter entre 2 e 6 jogadores.')
  }
  if (teams.some((team) => team.members.length === 0)) throw new Error('Todas as equipas precisam de participantes.')

  const deck = shuffled(cards, random)
  const currentTeamIndex = Math.min(teams.length - 1, Math.floor(random() * teams.length))
  const state: MatchState = {
    status: 'playing',
    teams: teams.map((team) => ({ ...team, members: [...team.members], position: 0 })),
    deck,
    nextCardIndex: 1 % deck.length,
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

function advanceTurn(state: MatchState, random: () => number): MatchState {
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

  const nextCardIndex = state.nextCardIndex
  let deck = state.deck
  let followingCardIndex = nextCardIndex
  let afterNextCardIndex = nextCardIndex + 1

  if (nextCardIndex >= deck.length) {
    deck = shuffled(deck, random)
    followingCardIndex = 0
    afterNextCardIndex = 1 % deck.length
  } else if (afterNextCardIndex >= deck.length) {
    afterNextCardIndex = deck.length
  }

  const teamTurnsPlayed = {
    ...state.teamTurnsPlayed,
    [finishedTeamId]: (state.teamTurnsPlayed[finishedTeamId] ?? 0) + 1,
  }
  const nextState: MatchState = {
    ...state,
    deck,
    nextCardIndex: afterNextCardIndex,
    currentTeamIndex: nextTeamIndex,
    teamTurnsPlayed,
    secondsLeft: TURN_SECONDS,
    turn: null,
  }
  nextState.turn = makeTurn(nextState, nextTeamIndex, followingCardIndex)
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
    winnerTeamId: state.winnerTeamId ?? winner?.id ?? null,
    turn: allFinished ? null : state.turn,
  }
}

export function resolveCurrentItem(state: MatchState, correct: boolean, random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || !state.turn || state.turn.role === 'automated') return state
  if (state.turn.results[state.turn.itemIndex] !== 'pending') return state

  const result: ItemResult = correct ? 'correct' : 'skipped'
  const results = state.turn.results.map((item, index) => index === state.turn?.itemIndex ? result : item)
  const turn = { ...state.turn, results, itemIndex: state.turn.itemIndex + 1 }
  const moved = correct ? addMovement({ ...state, turn }, state.turn.teamId, 1) : { ...state, turn }

  if (moved.status === 'finished') return moved
  if (moved.winnerTeamId && !moved.teams.every((team) => team.position >= state.boardLength)) return advanceTurn(moved, random)
  if (turn.itemIndex >= turn.results.length) return advanceTurn(moved, random)
  return moved
}

export function endAutomatedTurn(state: MatchState, correctCount: number, random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || !state.turn || state.turn.role !== 'automated') return state
  const score = Math.max(0, Math.min(5, Math.floor(correctCount)))
  const results: ItemResult[] = Array.from({ length: 5 }, (_, index) => index < score ? 'correct' : 'skipped')
  const moved = addMovement({ ...state, turn: { ...state.turn, results, itemIndex: 5 } }, state.turn.teamId, score)
  if (moved.status === 'finished') return moved
  if (moved.winnerTeamId && !moved.teams.every((team) => team.position >= state.boardLength)) return advanceTurn(moved, random)
  return advanceTurn(moved, random)
}

export function tickMatch(state: MatchState, random: () => number = Math.random): MatchState {
  if (state.status !== 'playing' || !state.turn || state.turn.role === 'automated') return state
  if (state.secondsLeft <= 1) return advanceTurn({ ...state, secondsLeft: 0 }, random)
  return { ...state, secondsLeft: state.secondsLeft - 1 }
}

export function currentTeam(state: MatchState): MatchTeam | undefined {
  return state.teams[state.currentTeamIndex]
}

export function currentItemResult(state: MatchState): ItemResult | undefined {
  return state.turn?.results[state.turn.itemIndex]
}
