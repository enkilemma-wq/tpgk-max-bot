import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';
import { Role } from '../../domain/entities/Role';
import { SuperuserResult } from '../../application/use-cases/HandleSuperuserAction';

const { button } = Keyboard;

export interface SuperuserView {
  text: string;
  buttons?: Button[][];
}

function roleLabel(role: Role): string {
  if (role === 'superuser') return 'суперпользователь';
  if (role === 'employee') return 'сотрудник';
  return 'пользователь';
}

const BACK_TO_PANEL_BUTTON = button.callback('🔙 В панель', 'admin:panel');

export function buildSuperuserView(result: SuperuserResult): SuperuserView | null {
  switch (result.kind) {
    case 'panel':
      return {
        text: [
          '**Панель суперпользователя**',
          '',
          'Чтобы найти пользователя и назначить его сотрудником, отправьте:',
          '`/superuser <часть имени>`',
        ].join('\n'),
        buttons: [
          [button.callback('👤 Сотрудники', 'admin:employees')],
          [button.callback('🗂 Структура разделов', 'structure:root')],
        ],
      };

    case 'user_list': {
      if (result.users.length === 0) {
        return { text: 'Никого не найдено.', buttons: [[BACK_TO_PANEL_BUTTON]] };
      }
      const rows = result.users.map((user) => [
        button.callback(`${user.name} — ${roleLabel(user.role)}`, `admin:user:${user.id}`),
      ]);
      const text = result.truncated
        ? `Найдено больше ${result.users.length} совпадений, показаны первые. Уточните запрос:`
        : 'Выберите пользователя:';
      return { text, buttons: [...rows, [BACK_TO_PANEL_BUTTON]] };
    }

    case 'user_detail': {
      const { user } = result;
      const text = [`**${user.name}**`, `id: ${user.id}`, `Роль: ${roleLabel(user.role)}`].join('\n');

      if (user.role === 'user') {
        return {
          text,
          buttons: [
            [button.callback('➕ Назначить сотрудником', `admin:promote:${user.id}`)],
            [BACK_TO_PANEL_BUTTON],
          ],
        };
      }
      if (user.role === 'employee') {
        return {
          text,
          buttons: [
            [button.callback('➖ Снять сотрудника', `admin:demote:${user.id}`)],
            [BACK_TO_PANEL_BUTTON],
          ],
        };
      }
      return { text, buttons: [[BACK_TO_PANEL_BUTTON]] };
    }

    case 'user_not_found':
      return { text: 'Пользователь не найден.', buttons: [[BACK_TO_PANEL_BUTTON]] };

    default:
      return null;
  }
}
