import type { GameCard } from './catalog.ts'

const LOCAL_USED_CONTENT_KEY = 'maxaka:used-content:v3'
const LEGACY_USED_CARD_KEY = 'maxaka:used-cards:v2'
const LEGACY_USED_CONTENT_KEY = 'maxaka:used-content:v1'

export interface ContentHistoryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function getCardsWithUnusedContent(
  cards: readonly GameCard[],
  usedContentIds: ReadonlySet<string>,
): GameCard[] {
  return cards.filter((card) => card.items.every((item) => !usedContentIds.has(item.id)))
}

export function readLocalUsedContentIds(storage: ContentHistoryStorage, cards: readonly GameCard[] = []): Set<string> {
  const saved = storage.getItem(LOCAL_USED_CONTENT_KEY)
  const usedContentIds = saved === null ? new Set<string>() : parseStringSet(saved, 'conteúdos')
  const legacySaved = storage.getItem(LEGACY_USED_CONTENT_KEY)
  if (legacySaved !== null) {
    for (const contentId of parseStringSet(legacySaved, 'conteúdos')) usedContentIds.add(contentId)
  }
  const legacyCards = storage.getItem(LEGACY_USED_CARD_KEY)
  if (legacyCards !== null) {
    const usedCardIds = parseStringSet(legacyCards, 'cartas')
    for (const card of cards) {
      if (usedCardIds.has(card.id)) {
        for (const item of card.items) usedContentIds.add(item.id)
      }
    }
  }
  return usedContentIds
}

function parseStringSet(saved: string, label: string): Set<string> {
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    throw new Error(`O histórico local de ${label} está inválido.`)
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== 'string')) {
    throw new Error(`O histórico local de ${label} está inválido.`)
  }
  return new Set(parsed)
}

export function recordLocalCardUsage(storage: ContentHistoryStorage, card: GameCard, cards: readonly GameCard[]): void {
  const usedContentIds = readLocalUsedContentIds(storage, cards)
  for (const item of card.items) usedContentIds.add(item.id)
  storage.setItem(LOCAL_USED_CONTENT_KEY, JSON.stringify([...usedContentIds]))
}
