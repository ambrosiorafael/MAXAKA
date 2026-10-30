import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCardsWithUnusedContent, readLocalUsedContentIds, recordLocalCardUsage } from './cardHistory.ts'
import { localCards } from './catalog.ts'
import { startMatch } from './engine.ts'

const teams = [
  { id: 1, name: 'Equipa 1', color: 'orange', members: [
    { id: 'p1', name: 'Pessoa 1', avatar: '😀', isBot: false },
    { id: 'p2', name: 'Pessoa 2', avatar: '😎', isBot: true },
  ] },
  { id: 2, name: 'Equipa 2', color: 'blue', members: [
    { id: 'p3', name: 'Pessoa 3', avatar: '🥳', isBot: false },
    { id: 'p4', name: 'Pessoa 4', avatar: '🤓', isBot: true },
  ] },
]

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

test('local history persists all five used content IDs and excludes every overlapping card', () => {
  const storage = new MemoryStorage()
  const firstCard = localCards[0]!
  const anotherCardWithSharedContent = {
    ...firstCard,
    id: 'other-card',
  }

  recordLocalCardUsage(storage, firstCard, localCards)

  const usedContentIds = readLocalUsedContentIds(storage)
  assert.equal(usedContentIds.size, 5)
  assert.deepEqual(getCardsWithUnusedContent([firstCard, anotherCardWithSharedContent], usedContentIds), [])
})

test('one local match deck never gives a content item to two cards', () => {
  const firstCard = localCards[0]!
  const secondCard = localCards[1]!
  const overlappingCard = { ...firstCard, id: 'overlapping-card' }
  const deck = startMatch(teams, [firstCard, secondCard, overlappingCard], { random: () => 0 }).deck
  const contentIds = deck.flatMap((card) => card.items.map((item) => item.id))

  assert.equal(new Set(contentIds).size, contentIds.length)
  assert.equal(deck.length, 2)
})

test('invalid saved local history is reported instead of silently reset', () => {
  const storage = new MemoryStorage()
  storage.setItem('maxaka:used-content:v3', '{invalid')
  assert.throws(() => readLocalUsedContentIds(storage), /histórico local.*inválido/u)
})

test('migrates legacy used-content history for cards with preserved IDs', () => {
  const storage = new MemoryStorage()
  const firstCard = localCards[0]!
  const previousVersionCard = { ...firstCard, id: 'maxaka-v2-00000001' }
  storage.setItem('maxaka:used-content:v1', JSON.stringify(firstCard.items.map((item) => item.id)))

  const usedContentIds = readLocalUsedContentIds(storage, [firstCard, previousVersionCard])

  assert.equal(firstCard.id, 'maxaka-0001')
  assert.ok(firstCard.items.every((item) => usedContentIds.has(item.id)))
  assert.ok(previousVersionCard.items.every((item) => usedContentIds.has(item.id)))
})

test('local history exposes only disjoint cards until content is exhausted', () => {
  const storage = new MemoryStorage()
  const availableDeck = localCards.slice(0, 2)

  recordLocalCardUsage(storage, availableDeck[0]!, availableDeck)
  assert.deepEqual(
    getCardsWithUnusedContent(availableDeck, readLocalUsedContentIds(storage)),
    [availableDeck[1]],
  )

  recordLocalCardUsage(storage, availableDeck[1]!, availableDeck)
  assert.deepEqual(
    getCardsWithUnusedContent(availableDeck, readLocalUsedContentIds(storage)),
    [],
  )
})
