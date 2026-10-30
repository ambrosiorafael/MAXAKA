import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getCardPoolSizes, getContentItemCount, localCards, validateCatalog } from './catalog.ts'

describe('MAXAKA card catalog', () => {
  it(`contains ${localCards.length.toLocaleString('pt-BR')} base and imported cards with unique IDs`, () => {
    assert.equal(new Set(localCards.map((card) => card.id)).size, localCards.length)
    assert.ok(localCards.length >= 65000)
    assert.ok(getContentItemCount() >= 399)
    assert.ok(localCards.some((card) => card.id.startsWith('maxaka-supplemental-')))
    assert.equal(getCardPoolSizes().length, 16)
    assert.deepEqual(getCardPoolSizes().slice(0, 5), [25, 25, 25, 25, 25])
    assert.ok(getCardPoolSizes().slice(5).every((size) => size >= 10))
    assert.ok(new Set(localCards.flatMap((card) => card.items.map((item) => item.category))).size >= 17)
    assert.ok(localCards.some((card) => card.items.some((item) => item.category === 'Família e convivência')))

    const normalizedWords = new Set<string>()
    const combinations = new Set<string>()
    for (const card of localCards) {
      assert.equal(card.items.length, 5)
      assert.equal(new Set(card.items.map((item) => item.id)).size, 5)
      assert.equal(new Set(card.items.map((item) => item.category)).size, 5)
      const combination = card.items.map((item) => item.id).sort().join('|')
      assert.equal(combinations.has(combination), false)
      combinations.add(combination)
      for (const item of card.items) {
        assert.ok(item.id && item.word.trim() && item.hint.trim())
        assert.doesNotMatch(item.word, /\d/u)
        assert.doesNotMatch(item.hint, /Elemento suplementar/u)
        normalizedWords.add(item.word.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-PT').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' '))
      }
    }
    assert.equal(normalizedWords.size, getContentItemCount())
    assert.equal(combinations.size, localCards.length)
  })

  it('includes simple everyday words with short clues', () => {
    const items = localCards.flatMap((card) => card.items)
    for (const word of ['Terra', 'Carro', 'Casa', 'Macaco', 'Água', 'Sol', 'Lua', 'Gato', 'Cão']) {
      assert.ok(items.some((item) => item.word === word), `Missing everyday word: ${word}`)
    }
    for (const item of items.filter(({ word }) => ['Terra', 'Carro', 'Casa', 'Macaco'].includes(word))) {
      assert.ok(item.hint.length <= 60)
    }
  })

  it('keeps a very large reserve of unique combinations to avoid deck exhaustion', () => {
    assert.ok(localCards.length >= 65000)
    const uniqueCombinations = new Set(localCards.map((card) => card.items.map((item) => item.id).sort().join('|')))
    assert.ok(uniqueCombinations.size >= 65000)
  })

  it('builds unique combinations from curated pools and the attached catalog', () => {
    assert.doesNotThrow(() => validateCatalog())

    const first = localCards[0]!
    const second = localCards[1]!
    const reorderedDuplicate = { ...second, items: [...first.items].reverse() as typeof first.items }
    assert.throws(() => validateCatalog([first, reorderedDuplicate]), /combinação de conteúdos repetida/i)

    const duplicateSource = first.items[0]!
    const duplicateItems = [...second.items] as typeof second.items
    const duplicateCategoryIndex = duplicateItems.findIndex((item) => item.category === duplicateSource.category)
    duplicateItems[duplicateCategoryIndex] = {
      ...duplicateSource,
      id: 'item-duplicate-name',
      word: `  ${duplicateSource.word.toUpperCase().replace(/\s+/gu, '---')}! `,
    }
    assert.throws(() => validateCatalog([first, { ...second, items: duplicateItems }]), /Conteúdo duplicado/)
  })
})
