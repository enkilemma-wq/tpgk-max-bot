import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';
import { MenuResult } from '../../application/use-cases/BrowseMenu';
import { PageAttachment } from '../../domain/entities/PageAttachment';
import { chunk, paginationRow, ROW_SIZE } from './keyboardHelpers';

const { button } = Keyboard;

export interface MenuView {
  text: string;
  buttons?: Button[][];
  imageAttachments?: PageAttachment[];
}

const BACK_TO_MENU_BUTTON = button.callback('🔙 В меню', 'm:root:0');

function backButton(parentId: number | null): Button {
  return parentId === null ? BACK_TO_MENU_BUTTON : button.callback('🔙 Назад', `m:node:${parentId}:0`);
}

// На верхнем уровне "Назад" и так ведёт в меню — второй кнопкой дублировать незачем.
// На вложенных уровнях добавляем быстрый переход в меню, чтобы не кликать "Назад" несколько раз подряд.
function backRow(parentId: number | null): Button[] {
  return parentId === null ? [backButton(parentId)] : [backButton(parentId), BACK_TO_MENU_BUTTON];
}

function heading(breadcrumb: string[], current: string): string {
  return breadcrumb.length > 0 ? [...breadcrumb, `**${current}**`].join(' › ') : `**${current}**`;
}

export function buildMenuView(result: MenuResult): MenuView | null {
  switch (result.kind) {
    case 'root': {
      const { nodes, batch, totalBatches } = result;
      if (nodes.length === 0) {
        return { text: 'Разделов пока нет.' };
      }
      const lines = nodes.map((n, i) => `${batch * ROW_SIZE + i + 1}. ${n.title}`);
      const numberButtons = nodes.map((n, i) =>
        button.callback(String(batch * ROW_SIZE + i + 1), `m:node:${n.id}:0`),
      );
      const buttons: Button[][] = chunk(numberButtons, ROW_SIZE);
      const pageRow = paginationRow(batch, totalBatches, (b) => `m:root:${b}`);
      if (pageRow) buttons.push(pageRow);
      // Отдельная кнопка "Обновить" — не все знают про команду /menu, а после скачивания файла
      // (он приходит отдельным сообщением) хочется быстро вернуться к свежему главному меню.
      // Payload "m:refresh" (а не "m:root:0") специально отличается от обычной навигации: обработчик
      // в MaxBotServer шлёт по нему НОВОЕ сообщение внизу чата, а не редактирует старое на месте —
      // иначе меню так и осталось бы выше скачанных документов, и до него пришлось бы прокручивать.
      buttons.push([button.callback('🔄 Обновить', 'm:refresh')]);
      return { text: ['**Главное меню**', '', ...lines].join('\n'), buttons };
    }

    case 'nodes': {
      const { nodeId, parentId, title, breadcrumb, nodes, batch, totalBatches } = result;
      const lines = nodes.map((n, i) => `${batch * ROW_SIZE + i + 1}. ${n.title}`);
      const numberButtons = nodes.map((n, i) =>
        button.callback(String(batch * ROW_SIZE + i + 1), `m:node:${n.id}:0`),
      );
      const buttons: Button[][] = chunk(numberButtons, ROW_SIZE);
      const pageRow = paginationRow(batch, totalBatches, (b) => `m:node:${nodeId}:${b}`);
      if (pageRow) buttons.push(pageRow);
      buttons.push(backRow(parentId));
      return { text: [heading(breadcrumb, title), '', ...lines].join('\n'), buttons };
    }

    case 'pages': {
      const { nodeId, parentId, title, breadcrumb, pages, batch, totalBatches } = result;
      const lines = pages.map((p, i) => `${batch * ROW_SIZE + i + 1}. ${p.title}`);
      const numberButtons = pages.map((p, i) =>
        button.callback(String(batch * ROW_SIZE + i + 1), `m:page:${nodeId}:${batch * ROW_SIZE + i}`),
      );
      const buttons: Button[][] = chunk(numberButtons, ROW_SIZE);
      const pageRow = paginationRow(batch, totalBatches, (b) => `m:node:${nodeId}:${b}`);
      if (pageRow) buttons.push(pageRow);
      buttons.push(backRow(parentId));
      return { text: [heading(breadcrumb, title), '', ...lines].join('\n'), buttons };
    }

    case 'page': {
      const { nodeId, page, pageIndex, totalPages, attachments, breadcrumb } = result;
      const batch = Math.floor(pageIndex / ROW_SIZE);
      const listBackButton = button.callback('🔙 К списку', `m:node:${nodeId}:${batch}`);
      const buttons: Button[][] = [];
      const pageRow = paginationRow(pageIndex, totalPages, (i) => `m:page:${nodeId}:${i}`);
      if (pageRow) buttons.push(pageRow);
      const files = attachments.filter((a) => a.type === 'file');
      for (const file of files) {
        buttons.push([button.callback(`📄 ${file.filename ?? 'Документ'}`, `m:file:${file.id}`)]);
      }
      buttons.push([listBackButton, BACK_TO_MENU_BUTTON]);
      const text = [heading(breadcrumb, page.title), '', page.description].join('\n');
      const imageAttachments = attachments.filter((a) => a.type === 'image');
      return { text, buttons, imageAttachments };
    }

    case 'empty':
      return {
        text: `${heading(result.breadcrumb, result.title)}\n\nПока пусто.`,
        buttons: [backRow(result.parentId)],
      };

    case 'not_found':
      return { text: 'Не найдено.', buttons: [[BACK_TO_MENU_BUTTON]] };

    default:
      return null;
  }
}
