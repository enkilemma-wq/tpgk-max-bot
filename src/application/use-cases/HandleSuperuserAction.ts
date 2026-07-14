import { BotUser } from '../../domain/entities/BotUser';
import { Role } from '../../domain/entities/Role';
import { UserRepository } from '../../domain/ports/UserRepository';

const SEARCH_RESULT_LIMIT = 15;
// promote — шаг вверх по лестнице, demote — шаг вниз. Суперпользователь теперь тоже достижим
// повышением (не только назначается вручную в БД), поэтому и снятие прав должно быть симметричным.
const ROLE_LADDER: Role[] = ['user', 'employee', 'superuser'];

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
  | { kind: 'user_not_found' }
  | { kind: 'last_superuser'; user: BotUser };

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

      case 'promote': {
        const target = await this.userRepository.findById(action.targetId);
        if (!target) {
          return { kind: 'user_not_found' };
        }
        const currentIndex = ROLE_LADDER.indexOf(target.role);
        if (currentIndex >= ROLE_LADDER.length - 1) {
          return { kind: 'user_detail', user: target };
        }
        const newRole = ROLE_LADDER[currentIndex + 1];
        await this.userRepository.setRole(action.targetId, newRole);
        return { kind: 'user_detail', user: { ...target, role: newRole } };
      }

      case 'demote': {
        const target = await this.userRepository.findById(action.targetId);
        if (!target) {
          return { kind: 'user_not_found' };
        }
        const currentIndex = ROLE_LADDER.indexOf(target.role);
        if (currentIndex <= 0) {
          return { kind: 'user_detail', user: target };
        }
        if (target.role === 'superuser') {
          const superusers = await this.userRepository.findByRole('superuser');
          if (superusers.length <= 1) {
            // Иначе управлять ролями стало бы некому — только повторное назначение вручную через БД.
            return { kind: 'last_superuser', user: target };
          }
        }
        const newRole = ROLE_LADDER[currentIndex - 1];
        await this.userRepository.setRole(action.targetId, newRole);
        return { kind: 'user_detail', user: { ...target, role: newRole } };
      }
    }
  }
}
