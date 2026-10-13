import assert from 'node:assert/strict'
import test from 'node:test'
import { avatarCategories, avatarOptions, defaultAvatar, isAvatar } from './avatars.ts'

test('MAXAKA avatar catalogue', async (suite) => {
  await suite.test('provides six non-empty categories and a unique overall picker', () => {
    assert.equal(avatarCategories.length, 6)
    assert.ok(avatarCategories.every((category) => category.avatars.length > 0))
    assert.equal(new Set(avatarOptions.map(({ emoji }) => emoji)).size, avatarOptions.length)
    assert.ok(avatarOptions.length >= 80)
  })

  await suite.test('includes default, category-overlapping, and composed Unicode avatars', () => {
    assert.ok(isAvatar(defaultAvatar))
    assert.equal(avatarCategories.find((category) => category.id === 'animals')?.avatars.some(({ emoji }) => emoji === defaultAvatar), true)
    assert.equal(avatarCategories.find((category) => category.id === 'special')?.avatars.some(({ emoji }) => emoji === '👑'), true)
    assert.ok(isAvatar('🧑‍🚀'))
    assert.ok(isAvatar('👩🏽'))
    assert.ok(!isAvatar('not-an-avatar'))
  })
})
