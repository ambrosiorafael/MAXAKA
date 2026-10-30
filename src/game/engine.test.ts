import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { localCards } from './catalog.ts'
import {
  endAutomatedTurn,
  replaceCurrentTurnCard,
  resolveCurrentItem,
  startCurrentTurn,
  startMatch,
  tickMatch,
  DEFAULT_BOARD_LENGTH,
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

const firstTeamStarts = () => startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.5 }))

describe('MAXAKA local match engine', () => {
  it('starts a shuffled match with a 30-second turn and five card items', () => {
    const waiting = startMatch(mixedTeams, localCards, { random: () => 0.5 })

    assert.equal(waiting.status, 'playing')
    assert.equal(waiting.turnStatus, 'waiting')
    assert.equal(waiting.secondsLeft, TURN_SECONDS)
    assert.equal(waiting.boardLength, 30)
    assert.equal(waiting.turn?.results.length, 5)
    assert.equal(waiting.turn?.teamId, 2)
    assert.equal(waiting.turn?.role, 'automated')
    assert.equal(tickMatch(waiting), waiting)
    assert.equal(resolveCurrentItem(waiting, true), waiting)
    const active = startCurrentTurn(waiting)
    assert.equal(active.turnStatus, 'active')
    const humanTurn = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4 }))
    assert.equal(humanTurn.turn?.role, 'human-guesses')
    assert.equal(tickMatch(humanTurn).secondsLeft, TURN_SECONDS - 1)
  })

  it('uses the 30-space finish line by default for local matches', () => {
    assert.equal(DEFAULT_BOARD_LENGTH, 30)
    assert.equal(firstTeamStarts().boardLength, 30)
  })

  it('gives each team a distinct card and stops only after the whole deck is exhausted', () => {
    const humanTeams = mixedTeams.map((team) => ({
      ...team,
      members: team.members.map((member) => ({ ...member, isBot: false })),
    }))
    let match = startCurrentTurn(startMatch(humanTeams, localCards, { random: () => 0 }))
    const deckCardCount = match.deck.length
    assert.ok(deckCardCount > 1)
    const usedCards = new Set<string>()
    const usedCombinations = new Set<string>()
    const cardsByTeam = new Map<number, Set<string>>()
    const usedItems = new Set<string>()

    for (let turn = 0; turn < deckCardCount; turn += 1) {
      const cardId = match.turn?.card.id
      assert.ok(cardId)
      assert.equal(usedCards.has(cardId), false)
      usedCards.add(cardId)
      const card = match.turn!.card
      const combination = card.items.map((item) => item.id).sort().join('|')
      assert.equal(usedCombinations.has(combination), false)
      usedCombinations.add(combination)
      const teamId = match.turn!.teamId
      for (const [otherTeamId, teamCards] of cardsByTeam) {
        if (otherTeamId !== teamId) assert.equal(teamCards.has(cardId), false)
      }
      const teamCards = cardsByTeam.get(teamId) ?? new Set<string>()
      teamCards.add(cardId)
      cardsByTeam.set(teamId, teamCards)
      for (const item of match.turn!.card.items) {
        assert.equal(usedItems.has(item.id), false)
        usedItems.add(item.id)
      }

      for (let item = 0; item < 5; item += 1) {
        match = resolveCurrentItem(match, false, () => 0)
      }
      if (turn < deckCardCount - 1) {
        assert.equal(match.status, 'playing')
        match = startCurrentTurn(match)
      }
    }

    assert.equal(usedCards.size, deckCardCount)
    assert.equal(usedCombinations.size, deckCardCount)
    assert.equal(usedItems.size, deckCardCount * 5)
    assert.equal(match.status, 'finished')
    assert.equal(match.endReason, 'cards-exhausted')
    assert.equal(match.turn, null)
    assert.equal(startCurrentTurn(match), match)
  })

  it('randomizes card order independently for each match', () => {
    const firstMatch = startMatch(mixedTeams, localCards, { random: () => 0 })
    const secondMatch = startMatch(mixedTeams, localCards, { random: () => 0.5 })

    assert.notEqual(firstMatch.turn?.card.id, secondMatch.turn?.card.id)
    assert.equal(new Set(secondMatch.deck.map((card) => card.id)).size, secondMatch.deck.length)
    const usedContentIds = new Set(secondMatch.deck.flatMap((card) => card.items.map((item) => item.id)))
    assert.equal(usedContentIds.size, secondMatch.deck.length * 5)
  })

  it('keeps every unique card in an online deck even when words appear on different cards', () => {
    const cards = localCards.slice(0, 100)
    const match = startMatch(mixedTeams, cards, { random: () => 0.4, allowRepeatedItems: true })

    assert.equal(match.deck.length, cards.length)
    assert.equal(new Set(match.deck.map((card) => card.id)).size, cards.length)
    assert.ok(new Set(match.deck.flatMap((card) => card.items.map((item) => item.id))).size < cards.length * 5)
  })

  it('excludes content already used in earlier local matches', () => {
    const usedContentIds = new Set(localCards[0]!.items.map((item) => item.id))
    const match = startMatch(mixedTeams, localCards, { random: () => 0, usedContentIds })

    assert.ok(match.deck.every((card) => card.items.every((item) => !usedContentIds.has(item.id))))
  })

  it('falls back to a shuffled deck when no card can avoid repeated content', () => {
    const usedContentIds = new Set(localCards.slice(0, 3).flatMap((card) => card.items.map((item) => item.id)))
    const fullDeck = localCards.slice(0, 3)
    const match = startMatch(mixedTeams, fullDeck, { random: () => 0, usedContentIds })

    assert.equal(match.deck.length, fullDeck.length)
    assert.equal(match.status, 'playing')
  })

  it('advances the deck cursor when another online match reserved the pending card', () => {
    const deck = localCards.slice(0, 5)
    let match = startCurrentTurn(startMatch(mixedTeams, deck, { random: () => 0 }))
    for (let item = 0; item < 5; item += 1) match = resolveCurrentItem(match, false)

    const pendingCard = match.turn?.card
    const replacementCard = match.deck[3]
    assert.ok(pendingCard)
    assert.ok(replacementCard)
    const replaced = replaceCurrentTurnCard(match, replacementCard)
    assert.equal(replaced.turn?.card.id, replacementCard.id)
    assert.equal(replaced.nextCardIndex, 4)

    let nextTurn = startCurrentTurn(replaced)
    for (let item = 0; item < 5; item += 1) nextTurn = resolveCurrentItem(nextTurn, false)
    assert.equal(nextTurn.turn?.card.id, deck[4]?.id)
    assert.notEqual(nextTurn.turn?.card.id, pendingCard.id)
  })

  it('does not recycle a single card when a campaign has only one card', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, [localCards[0]!], { random: () => 0 }))
    for (let item = 0; item < 5; item += 1) match = resolveCurrentItem(match, false)

    assert.equal(match.status, 'finished')
    assert.equal(match.endReason, 'cards-exhausted')
    assert.equal(match.turn, null)
  })

  it('awards one space per correct answer and none for a pass', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4 }))
    assert.equal(match.turn?.role, 'human-guesses')

    const currentId = match.turn?.teamId
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, false, () => 0.4)

    assert.equal(match.teams.find((team) => team.id === currentId)?.position, 1)
    assert.equal(match.turn?.results[0], 'correct')
    assert.equal(match.turn?.results[1], 'skipped')
  })

  it('alternates the human and bot clue-giver roles within a mixed team', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4 }))
    assert.equal(match.turn?.role, 'human-guesses')

    for (let item = 0; item < 5; item += 1) {
      match = resolveCurrentItem(match, false, () => 0.4)
    }
    match = startCurrentTurn(match)
    match = endAutomatedTurn(match, 0, () => 0.4)

    assert.equal(match.turn?.teamId, 1)
    assert.equal(match.turn?.role, 'human-gives')
  })

  it('ends a human turn when its 30-second timer expires', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4 }))
    const firstCardId = match.turn?.card.id
    for (let second = 0; second < TURN_SECONDS; second += 1) {
      match = tickMatch(match, () => 0.4)
    }

    assert.equal(match.secondsLeft, TURN_SECONDS)
    assert.notEqual(match.turn?.card.id, firstCardId)
    assert.equal(match.turn?.teamId, 2)
    assert.equal(match.turn?.role, 'automated')
    assert.equal(match.turnStatus, 'waiting')
  })

  it('keeps the match alive while other teams are still racing after a win', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4, boardLength: 2 }))
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, true, () => 0.4)

    assert.equal(match.status, 'playing')
    assert.equal(match.winnerTeamId, 1)
    assert.equal(match.teams.find((team) => team.id === 1)?.position, 2)
    assert.equal(match.turn?.teamId, 2)
    assert.equal(match.turn?.role, 'automated')
  })

  it('finishes the match only when every team has reached the final space', () => {
    let match = startCurrentTurn(startMatch(mixedTeams, localCards, { random: () => 0.4, boardLength: 2 }))
    match = resolveCurrentItem(match, true, () => 0.4)
    match = resolveCurrentItem(match, true, () => 0.4)
    match = startCurrentTurn(match)
    match = endAutomatedTurn(match, 2, () => 0.4)

    assert.equal(match.status, 'finished')
    assert.equal(match.winnerTeamId, 1)
    assert.equal(match.turn, null)
  })

  it('applies an automated bot result and continues to the next team', () => {
    const match = firstTeamStarts()
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
