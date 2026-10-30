import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { test } from 'node:test'
import mysql from 'mysql2/promise'
import { config } from './config.ts'
import { localCards } from '../src/game/catalog.ts'

const connectionOptions = {
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  database: config.MYSQL_DATABASE,
}

test('scopes card reservations to each online match', async () => {
  const connection = await mysql.createConnection(connectionOptions)
  const playerId = randomUUID()
  const roomId = randomUUID()
  const firstMatchId = randomUUID()
  const secondMatchId = randomUUID()
  const firstTeamId = randomUUID()
  const secondTeamId = randomUUID()
  const firstTurnId = randomUUID()
  const secondTurnId = randomUUID()
  const roomCode = `T${String(randomInt(0, 100000)).padStart(5, '0')}`
  let fixtureCreated = false

  try {
    const [publishedCards] = await connection.execute<Array<{ count: number }>>(
      "SELECT COUNT(*) AS count FROM cards WHERE status = 'published'",
    )
    assert.equal(Number(publishedCards[0]?.count), localCards.length)
    assert.ok(Number(publishedCards[0]?.count) >= 65_000)

    const card = localCards[0]
    assert.ok(card)
    const [cardItems] = await connection.execute<Array<{ id: number; content_id: string }>>(
      'SELECT id, content_id FROM card_items WHERE card_id = ? ORDER BY item_order',
      [card.id],
    )
    assert.equal(cardItems.length, 5)

    await connection.beginTransaction()
    try {
      await connection.execute('INSERT INTO players (id, display_name, avatar_id) VALUES (?, ?, ?)', [playerId, 'Deck scope test', 'lion'])
      await connection.execute(
        "INSERT INTO rooms (id, room_code, host_player_id, status, team_count) VALUES (?, ?, ?, 'playing', 2)",
        [roomId, roomCode, playerId],
      )
      await connection.execute(
        "INSERT INTO matches (id, room_id, mode, status) VALUES (?, ?, 'online', 'playing'), (?, ?, 'online', 'playing')",
        [firstMatchId, roomId, secondMatchId, roomId],
      )
      await connection.execute(
        'INSERT INTO teams (id, match_id, team_number, name, color) VALUES (?, ?, 1, ?, ?), (?, ?, 1, ?, ?)',
        [firstTeamId, firstMatchId, 'First match', 'orange', secondTeamId, secondMatchId, 'Second match', 'blue'],
      )
      await connection.execute(
        'INSERT INTO match_turns (id, match_id, team_id, card_id, turn_number) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1)',
        [firstTurnId, firstMatchId, firstTeamId, card.id, secondTurnId, secondMatchId, secondTeamId, card.id],
      )
      const insertReservation = `INSERT INTO match_used_items
        (match_id, room_id, turn_id, card_id, card_item_id, content_id, player_id, team_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      for (const item of cardItems) {
        await connection.execute(insertReservation, [
          firstMatchId, roomId, firstTurnId, card.id, item.id, item.content_id, playerId, firstTeamId,
        ])
        await connection.execute(insertReservation, [
          secondMatchId, roomId, secondTurnId, card.id, item.id, item.content_id, playerId, secondTeamId,
        ])
      }
      await connection.commit()
      fixtureCreated = true
    } catch (error) {
      await connection.rollback()
      throw error
    }

    const [reservations] = await connection.execute<Array<{ count: number }>>(
      'SELECT COUNT(*) AS count FROM match_used_items WHERE match_id IN (?, ?) AND card_id = ?',
      [firstMatchId, secondMatchId, card.id],
    )
    assert.equal(Number(reservations[0]?.count), 10, 'the same card may be used in independent matches')

    const [globalReservations] = await connection.execute<Array<{ count: number }>>(
      'SELECT COUNT(*) AS count FROM global_content_usage WHERE match_id IN (?, ?)',
      [firstMatchId, secondMatchId],
    )
    assert.equal(Number(globalReservations[0]?.count), 0, 'online card distribution must not write the global usage table')

    let rejectedDuplicateWithinMatch = false
    try {
      const item = cardItems[0]!
      await connection.execute(
        `INSERT INTO match_used_items
           (match_id, room_id, turn_id, card_id, card_item_id, content_id, player_id, team_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [firstMatchId, roomId, firstTurnId, card.id, item.id, item.content_id, playerId, firstTeamId],
      )
    } catch (error) {
      rejectedDuplicateWithinMatch = (error as { code?: string }).code === 'ER_DUP_ENTRY'
    }
    assert.equal(rejectedDuplicateWithinMatch, true, 'a card cannot be reserved twice in the same match')
  } finally {
    if (fixtureCreated) {
      await connection.execute('DELETE FROM matches WHERE id IN (?, ?)', [firstMatchId, secondMatchId])
      await connection.execute('DELETE FROM rooms WHERE id = ?', [roomId])
      await connection.execute('DELETE FROM players WHERE id = ?', [playerId])
    }
    await connection.end()
  }
})
