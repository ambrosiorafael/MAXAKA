import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2'
import mysql from 'mysql2/promise'
import { localCards, type GameCard } from '../src/game/catalog.ts'
import { config } from './config.ts'

export const database = mysql.createPool({
  host: config.MYSQL_HOST,
  port: config.MYSQL_PORT,
  database: config.MYSQL_DATABASE,
  user: config.MYSQL_USER,
  password: config.MYSQL_PASSWORD,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: config.MYSQL_CONNECTION_LIMIT,
  queueLimit: config.MYSQL_QUEUE_LIMIT,
})

type CardRow = RowDataPacket & {
  card_id: string
  category: string
  item_order: number
  word: string
  hint: string
}

async function applyMigrations(): Promise<void> {
  const connection = await database.getConnection()
  let lockAcquired = false
  try {
    const [lockRows] = await connection.query<Array<RowDataPacket & { acquired: number | null }>>(
      'SELECT GET_LOCK(?, 30) AS acquired',
      ['maxaka:schema-migrations'],
    )
    lockAcquired = lockRows[0]?.acquired === 1
    if (!lockAcquired) throw new Error('Não foi possível obter o bloqueio MySQL para aplicar as migrações.')

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    const migrationsPath = fileURLToPath(new URL('./migrations/', import.meta.url))
    const migrations = (await readdir(migrationsPath)).filter((name) => name.endsWith('.sql')).sort()

    for (const name of migrations) {
      const [applied] = await connection.execute<RowDataPacket[]>(
        'SELECT name FROM schema_migrations WHERE name = ?',
        [name],
      )
      if (applied.length > 0) continue

      const source = await readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8')
      const statements = source.split(';').map((statement) => statement.trim()).filter(Boolean)
      for (const statement of statements) await connection.query(statement)
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [name])
      console.info(`Aplicada migração MySQL: ${name}`)
    }
  } finally {
    try {
      if (lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', ['maxaka:schema-migrations'])
    } finally {
      connection.release()
    }
  }
}

async function seedCards(): Promise<void> {
  for (const card of localCards) {
    await database.execute(
      `INSERT INTO categories (name, language_code)
       VALUES (?, 'pt-MZ')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [card.category],
    )
    const [categoryRows] = await database.execute<RowDataPacket[]>(
      'SELECT id FROM categories WHERE name = ? AND language_code = ?',
      [card.category, 'pt-MZ'],
    )
    const categoryId = categoryRows[0]?.id
    if (!categoryId) throw new Error(`Não foi possível guardar a categoria "${card.category}".`)

    await database.execute(
      `INSERT INTO cards (id, category_id, language_code, status)
       VALUES (?, ?, 'pt-MZ', 'published')
       ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), status = 'published'`,
      [card.id, categoryId],
    )
    for (const [index, item] of card.items.entries()) {
      await database.execute(
        `INSERT INTO card_items (card_id, item_order, text, hint)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE text = VALUES(text), hint = VALUES(hint)`,
        [card.id, index, item.word, item.hint],
      )
    }
  }
}

export async function initializeDatabase(): Promise<void> {
  await database.query('SELECT 1')
  await applyMigrations()
  await seedCards()
}

export async function loadPublishedCards(): Promise<GameCard[]> {
  const [rows] = await database.execute<CardRow[]>(
    `SELECT cards.id AS card_id, categories.name AS category,
            card_items.item_order, card_items.text AS word, card_items.hint
       FROM cards
       JOIN categories ON categories.id = cards.category_id
       JOIN card_items ON card_items.card_id = cards.id
      WHERE cards.status = 'published'
      ORDER BY cards.id, card_items.item_order`,
  )
  const cards = new Map<string, { category: string; items: Array<{ word: string; hint: string }> }>()

  for (const row of rows) {
    const card = cards.get(row.card_id) ?? { category: row.category, items: [] }
    card.items.push({ word: row.word, hint: row.hint })
    cards.set(row.card_id, card)
  }

  const result: GameCard[] = []
  for (const [id, data] of cards) {
    if (data.items.length !== 5) throw new Error(`A carta "${id}" tem ${data.items.length} itens; são necessários cinco.`)
    result.push({ id, category: data.category, items: data.items as GameCard['items'] })
  }
  if (result.length === 0) throw new Error('A base de dados não tem cartas publicadas.')
  return result
}

export async function closeDatabase(): Promise<void> {
  await database.end()
}
