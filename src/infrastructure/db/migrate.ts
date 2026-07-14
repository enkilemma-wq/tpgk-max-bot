import 'dotenv/config';
import { createPool } from './pool';
import { ensureDatabaseExists } from './ensureDatabase';
import { seedInitialContent } from './seedContent';

const pool = createPool();

async function migrate(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  await ensureDatabaseExists(connectionString);

  // "sections" — таблица из самой первой (плоской) схемы, до перехода на рекурсивные "nodes".
  // Больше нигде не используется, поэтому безопасно дропается при каждом запуске.
  // pages/page_attachments/nodes — НЕ трогаем: там боевой контент, дропать нельзя.
  await pool.query('DROP TABLE IF EXISTS sections CASCADE');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      username TEXT,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'employee', 'superuser')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS pages (
      id SERIAL PRIMARY KEY,
      node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS page_attachments (
      id SERIAL PRIMARY KEY,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('image', 'file')),
      token TEXT NOT NULL,
      filename TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Композитные индексы покрывают и фильтр (parent_id / node_id), и сортировку (sort_order, id) —
    -- без них LIMIT/OFFSET-выборка при большом числе строк требует отдельного шага сортировки на диске.
    CREATE INDEX IF NOT EXISTS nodes_parent_sort_idx ON nodes(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS pages_node_sort_idx ON pages(node_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS page_attachments_page_id_idx ON page_attachments(page_id);

    -- Старые одноколоночные индексы избыточны рядом с композитными выше (composite покрывает те же
    -- запросы как префикс) — оставлять оба означало бы просто платить лишним индексом на каждую запись.
    DROP INDEX IF EXISTS nodes_parent_id_idx;
    DROP INDEX IF EXISTS pages_node_id_idx;
  `);

  const { rows } = await pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM nodes');
  if (rows[0].count === 0) {
    await seedInitialContent(pool);
  }
}

migrate()
  .then(() => {
    console.log('Migration complete');
    return pool.end();
  })
  .catch((err) => {
    console.error('Migration failed', err);
    return pool.end().finally(() => process.exit(1));
  });
