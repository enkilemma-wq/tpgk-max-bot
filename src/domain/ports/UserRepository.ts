import { BotUser } from '../entities/BotUser';
import { Role } from '../entities/Role';

export interface StartedUserInfo {
  id: number;
  chatId: number;
  name: string;
  username: string | null;
}

export interface UserRepository {
  registerStart(user: StartedUserInfo): Promise<void>;
  getRole(userId: number): Promise<Role>;
  setRole(userId: number, role: Role): Promise<void>;
  findById(userId: number): Promise<BotUser | null>;
  findByRole(role: Role): Promise<BotUser[]>;
  search(query: string, limit: number): Promise<BotUser[]>;
}
