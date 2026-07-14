import { Client } from 'pg';

// Позволяет админу не создавать базу вручную через psql/createdb: указал в DATABASE_URL любое имя,
// npm run migrate сам проверит, есть ли такая база на сервере, и создаст, если нет. Требует, чтобы
// пользователь из DATABASE_URL имел право CREATEDB (обычно так и есть для суперпользователя postgres).
export async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const url = new URL(connectionString);
  const targetDb = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!targetDb) {
    throw new Error('DATABASE_URL должен указывать имя базы, например postgres://user:password@localhost:5432/tpgk');
  }

  // Подключаемся к служебной базе "postgres" — она есть в любой стандартной установке PostgreSQL
  // и нужна только для того, чтобы выполнить CREATE DATABASE (нельзя создать базу, уже находясь в ней).
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  const client = new Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Не удалось подключиться к PostgreSQL, чтобы проверить/создать базу "${targetDb}". ` +
        `Убедитесь, что сервер запущен и данные в DATABASE_URL верны, либо создайте базу вручную: CREATE DATABASE "${targetDb}";\n` +
        `Исходная ошибка: ${(err as Error).message}`,
    );
  }

  try {
    const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDb]);
    if (result.rows.length === 0) {
      // Имя базы нельзя параметризовать через $1 — экранируем вручную (кавычки внутри имени удваиваем).
      const safeName = targetDb.replace(/"/g, '""');
      await client.query(`CREATE DATABASE "${safeName}"`);
      console.log(`База данных "${targetDb}" не существовала — создана автоматически.`);
    }
  } catch (err) {
    throw new Error(
      `Не удалось создать базу данных "${targetDb}" автоматически (нужны права CREATEDB). ` +
        `Создайте её вручную: CREATE DATABASE "${targetDb}";\n` +
        `Исходная ошибка: ${(err as Error).message}`,
    );
  } finally {
    await client.end();
  }
}
