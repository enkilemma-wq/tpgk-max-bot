import { Role } from './Role';

export interface BotUser {
  id: number;
  chatId: number;
  name: string;
  username: string | null;
  role: Role;
}
