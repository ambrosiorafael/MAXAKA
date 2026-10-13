import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { localCards } from './catalog.ts'
import {
  endAutomatedTurn,
  resolveCurrentItem,
  startMatch,
  tickMatch,
  TURN_SECONDS,
} from './engine.ts'

const mixedTeams = [
  {
    id: 1,
    name: 'Equipa 1',
    color: 'orange',
    members: [
      { id: 'human', name: 'Mia', avatar: '🦁', isBot: false },
      { id: 'bot-1', name: 'Paito', avatar: '🐘', isBot: true },
    ],
  },
  {
    id: 2,
    name: 'Equipa 2',
    color: 'blue',
    members: [
      { id: 'bot-2', name: 'Ana', avatar: '🦜', isBot: true },
      { id: 'bot-3', name: 'Maria', avatar: '🐆', isBot: true },
    ],
  },
]

const firstTeamStarts = () => startMatch(mixedTeams, localCards, { random: () => 0.5 })

describe('MAXAKA local match engine', () => {
  it('starts a shuffled match with a 30-second turn and five card items', () => {
    const match = firstTeamStarts()

    assert.equal(match.status, 'playing')
    assert.equal(match.secondsLeft, TURN_SECONDS)
    assert.equal(match.turn?.results.length, 5)
    assert.equal(match.turn?.teamId, 2)
    assert.equal(match.turn?.role, 'automated')
  })

  it('awards one space per correct answer and none for a pass', () => {
    let match = startMatch(mixedTeams, localCards, { random: () => 0.4 })
    assert.equal(match.turn?.role, 'human-guesses')

    const currentId = match.turn?.teamId
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, false, () => 0.4)

    assert.equal(match.teams.find((team) => team.id === currentId)?.position, 1)
    assert.equal(match.turn?.results[0], 'correct')
    assert.equal(match.turn?.results[1], 'skipped')
  })

  it('alternates the human and bot clue-giver roles within a mixed team', () => {
    let match = startMatch(mixedTeams, localCards, { random: () => 0.4 })
    assert.equal(match.turn?.role, 'human-guesses')

    for (let item = 0; item < 5; item += 1) {
      match = resolveCurrentItem(match, false, () => 0.4)
    }
    match = endAutomatedTurn(match, 0, () => 0.4)

    assert.equal(match.turn?.teamId, 1)
    assert.equal(match.turn?.role, 'human-gives')
  })

  it('ends a human turn when its 30-second timer expires', () => {
    let match = startMatch(mixedTeams, localCards, { random: () => 0.4 })
    for (let second = 0; second < TURN_SECONDS; second += 1) {
      match = tickMatch(match, () => 0.4)
    }

    assert.equal(match.secondsLeft, TURN_SECONDS)
    assert.equal(match.turn?.teamId, 2)
    assert.equal(match.turn?.role, 'automated')
  })

  it('keeps the match alive while other teams are still racing after a win', () => {
    let match = startMatch(mixedTeams, localCards, { random: () => 0.4, boardLength: 2 })
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, true, () => 0.4)

    assert.equal(match.status, 'playing')
    assert.equal(match.winnerTeamId, 1)
    assert.equal(match.teams.find((team) => team.id === 1)?.position, 2)
    assert.equal(match.turn?.teamId, 2)
    assert.equal(match.turn?.role, 'automated')
  })

  it('finishes the match only when every team has reached the final space', () => {
    let match = startMatch(mixedTeams, localCards, { random: () => 0.4, boardLength: 2 })
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, true, () => 0.4)
    match = endAutomatedTurn(match, 2, () => 0.4)

    assert.equal(match.status, 'finished')
    assert.equal(match.winnerTeamId, 1)
    assert.equal(match.turn, null)
  })

  it('applies an automated bot result and continues to the next team', () => {
    const match = startMatch(mixedTeams, localCards, { random: () => 0.5 })
    const next = endAutomatedTurn(match, 3, () => 0.5)

    assert.equal(next.teams.find((team) => team.id === 2)?.position, 3)
    assert.equal(next.turn?.teamId, 1)
    assert.equal(next.turn?.role, 'human-guesses')
  })

  it('rejects invalid starting configurations', () => {
    assert.throws(() => startMatch(mixedTeams.slice(0, 1), localCards), /duas equipas/)
    assert.throws(() => startMatch(mixedTeams, []), /Não existem cartas/)
  })
})
