import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2'
import mysql from 'mysql2/promise'
import { canonicalGameContentName, gameContentAliases, localCards, normalizeGameContentName, validateCatalog, type GameCard } from '../src/game/catalog.ts'
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
  content_id: string | null
  item_category: string
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
  const activeCardIds = new Set(localCards.map((card) => card.id))
  const [publishedCards] = await database.execute<Array<RowDataPacket & { id: string }>>(
    "SELECT id FROM cards WHERE status = 'published'",
  )
  const obsoleteCardIds = publishedCards.map(({ id }) => id).filter((id) => !activeCardIds.has(id))
  const batchSize = 1000
  for (let offset = 0; offset < obsoleteCardIds.length; offset += batchSize) {
    const batch = obsoleteCardIds.slice(offset, offset + batchSize)
    await database.execute(
      `UPDATE cards SET status = 'archived' WHERE id IN (${batch.map(() => '?').join(',')})`,
      batch,
    )
  }

  const contentItems = [...new Map(localCards.flatMap((card) => card.items.map((item) => [item.id, item] as const))).values()]
  for (let offset = 0; offset < contentItems.length; offset += batchSize) {
    const batch = contentItems.slice(offset, offset + batchSize)
    await database.execute(
      `INSERT INTO content_catalog (id, normalized_text, canonical_text)
       VALUES ${batch.map(() => '(?, ?, ?)').join(',')}
       ON DUPLICATE KEY UPDATE canonical_text = VALUES(canonical_text)`,
      batch.flatMap((item) => [item.id, canonicalGameContentName(item.word), item.word]),
    )
  }
  for (const { alias, canonicalId } of gameContentAliases) {
    await database.execute(
      `INSERT INTO content_aliases (normalized_alias, content_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE content_id = VALUES(content_id)`,
      [normalizeGameContentName(alias), canonicalId],
    )
  }

  const categoryNames = [...new Set(localCards.flatMap((card) => [
    card.category,
    ...card.items.map((item) => item.category),
  ]))]
  const categoryIds = new Map<string, number>()

  for (const categoryName of categoryNames) {
    await database.execute(
      `INSERT INTO categories (name, language_code)
       VALUES (?, 'pt-MZ')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [categoryName],
    )
    const [categoryRows] = await database.execute<RowDataPacket[]>(
      'SELECT id FROM categories WHERE name = ? AND language_code = ?',
      [categoryName, 'pt-MZ'],
    )
    const categoryId = categoryRows[0]?.id as number | undefined
    if (!categoryId) throw new Error(`Não foi possível guardar a categoria "${categoryName}".`)
    categoryIds.set(categoryName, categoryId)
  }

  const cards = localCards.map((card) => {
    const categoryId = categoryIds.get(card.category)
    if (!categoryId) throw new Error(`A categoria "${card.category}" não tem registo de base de dados.`)
    return [card.id, categoryId, 'pt-MZ', 'published'] as const
  })
  for (let offset = 0; offset < cards.length; offset += batchSize) {
    const batch = cards.slice(offset, offset + batchSize)
    await database.execute(
      `INSERT INTO cards (id, category_id, language_code, status)
       VALUES ${batch.map(() => '(?, ?, ?, ?)').join(',')}
       ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), status = VALUES(status)`,
      batch.flat(),
    )
  }

  const cardItems = localCards.flatMap((card) => card.items.map((item, index) => [
    card.id,
    index,
    item.category,
    item.word,
    item.hint,
    item.id,
  ]))
  for (let offset = 0; offset < cardItems.length; offset += batchSize) {
    const batch = cardItems.slice(offset, offset + batchSize)
    await database.execute(
      `INSERT INTO card_items (card_id, item_order, category, text, hint, content_id)
       VALUES ${batch.map(() => '(?, ?, ?, ?, ?, ?)').join(',')}
       ON DUPLICATE KEY UPDATE category = VALUES(category), text = VALUES(text), hint = VALUES(hint), content_id = VALUES(content_id)`,
      batch.flat(),
    )
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
            card_items.item_order, card_items.content_id, card_items.category AS item_category,
            card_items.text AS word, card_items.hint
       FROM cards
       JOIN categories ON categories.id = cards.category_id
       JOIN card_items ON card_items.card_id = cards.id
      WHERE cards.status = 'published' AND card_items.content_id IS NOT NULL
      ORDER BY cards.id, card_items.item_order`,
  )
  const cards = new Map<string, { category: string; items: Array<{ id: string; word: string; hint: string; category: string }> }>()

  for (const row of rows) {
    const card = cards.get(row.card_id) ?? { category: row.category, items: [] }
    if (!row.content_id) throw new Error(`O item "${row.word}" da carta "${row.card_id}" não tem identificador de conteúdo.`)
    card.items.push({ id: row.content_id, word: row.word, hint: row.hint, category: row.item_category })
    cards.set(row.card_id, card)
  }

  const result: GameCard[] = []
  for (const [id, data] of cards) {
    if (data.items.length !== 5) throw new Error(`A carta "${id}" tem ${data.items.length} itens; são necessários cinco.`)
    result.push({ id, category: data.category, items: data.items as GameCard['items'] })
  }
  if (result.length === 0) throw new Error('A base de dados não tem cartas publicadas.')
  validateCatalog(result)
  return result
}

export async function closeDatabase(): Promise<void> {
  await database.end()
}
