import { BotUser } from '../../domain/entities/BotUser';
import { UserRepository } from '../../domain/ports/UserRepository';

const SEARCH_RESULT_LIMIT = 15;

export type SuperuserAction =
  | { type: 'open_panel' }
  | { type: 'list_employees' }
  | { type: 'search_users'; query: string }
  | { type: 'view_user'; targetId: number }
  | { type: 'promote'; targetId: number }
  | { type: 'demote'; targetId: number };

export type SuperuserResult =
  | { kind: 'unauthorized' }
  | { kind: 'panel' }
  | { kind: 'user_list'; users: BotUser[]; truncated: boolean }
  | { kind: 'user_detail'; user: BotUser }
  | { kind: 'user_not_found' };

export class HandleSuperuserAction {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(actorId: number, action: SuperuserAction): Promise<SuperuserResult> {
    const role = await this.userRepository.getRole(actorId);
    if (role !== 'superuser') {
      return { kind: 'unauthorized' };
    }

    switch (action.type) {
      case 'open_panel':
        return { kind: 'panel' };

      case 'list_employees': {
        const users = await this.userRepository.findByRole('employee');
        return { kind: 'user_list', users, truncated: false };
      }

      case 'search_users': {
        const users = await this.userRepository.search(action.query, SEARCH_RESULT_LIMIT + 1);
        const truncated = users.length > SEARCH_RESULT_LIMIT;
        return { kind: 'user_list', users: users.slice(0, SEARCH_RESULT_LIMIT), truncated };
      }

      case 'view_user': {
        const user = await this.userRepository.findById(action.targetId);
        return user ? { kind: 'user_detail', user } : { kind: 'user_not_found' };
      }

      case 'promote':
      case 'demote': {
        const target = await this.userRepository.findById(action.targetId);
        if (!target) {
          return { kind: 'user_not_found' };
        }
        if (target.role === 'superuser') {
          return { kind: 'user_detail', user: target };
        }
        const newRole = action.type === 'promote' ? 'employee' : 'user';
        await this.userRepository.setRole(action.targetId, newRole);
        return { kind: 'user_detail', user: { ...target, role: newRole } };
      }
    }
  }
}
