import { Pool } from 'pg';
import { BotUser } from '../../domain/entities/BotUser';
import { Role } from '../../domain/entities/Role';
import { StartedUserInfo, UserRepository } from '../../domain/ports/UserRepository';

type UserRow = {
  id: string;
  chat_id: string;
  name: string;
  username: string | null;
  role: Role;
};

function toBotUser(row: UserRow): BotUser {
  return {
    id: Number(row.id),
    chatId: Number(row.chat_id),
    name: row.name,
    username: row.username,
    role: row.role,
  };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async registerStart(user: StartedUserInfo): Promise<void> {
    await this.pool.query(
      `INSERT INTO users (id, chat_id, name, username)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET chat_id = EXCLUDED.chat_id,
           name = EXCLUDED.name,
           username = EXCLUDED.username`,
      [user.id, user.chatId, user.name, user.username],
    );
  }

  async getRole(userId: number): Promise<Role> {
    const result = await this.pool.query<{ role: Role }>(
      'SELECT role FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0]?.role ?? 'user';
  }

  async setRole(userId: number, role: Role): Promise<void> {
    await this.pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  }

  async findById(userId: number): Promise<BotUser | null> {
    const result = await this.pool.query<UserRow>(
      'SELECT id, chat_id, name, username, role FROM users WHERE id = $1',
      [userId],
    );
    return result.rows[0] ? toBotUser(result.rows[0]) : null;
  }

  async findByRole(role: Role): Promise<BotUser[]> {
    const result = await this.pool.query<UserRow>(
      'SELECT id, chat_id, name, username, role FROM users WHERE role = $1 ORDER BY name',
      [role],
    );
    return result.rows.map(toBotUser);
  }

  async search(query: string, limit: number): Promise<BotUser[]> {
    const result = await this.pool.query<UserRow>(
      'SELECT id, chat_id, name, username, role FROM users WHERE name ILIKE $1 ORDER BY name LIMIT $2',
      [`%${query}%`, limit],
    );
    return result.rows.map(toBotUser);
  }
}
