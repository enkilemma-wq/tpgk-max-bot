import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';
import { ManageContentResult } from '../../application/use-cases/ManageContent';
import { StaffView } from './staffView';
import { chunk, paginationRow, ROW_SIZE } from './keyboardHelpers';

const { button } = Keyboard;

function heading(breadcrumb: string[], current: string): string {
  return breadcrumb.length > 0 ? [...breadcrumb, `**${current}**`].join(' › ') : `**${current}**`;
}

const BACK_TO_ROOT_BUTTON = button.callback('🔙 К разделам', 'content:root');
// Список разделов/подкаталогов здесь выглядит так же, как в обычном публичном меню (те же номера,
// то же название) — сотрудник может не понять, что он всё ещё в режиме управления, а не в обычном
// просмотре сайта. Явная кнопка выхода снимает эту путаницу.
const EXIT_ADMIN_BUTTON = button.callback('🚪 Выйти в обычное меню', 'm:root:0');

export function buildContentPanelView(result: ManageContentResult): StaffView {
  switch (result.kind) {
    case 'root_list': {
      const { nodes, batch, totalBatches } = result;
      if (nodes.length === 0) {
        return {
          text: '**Управление контентом**\n\nРазделов пока нет. Их добавляет superuser через /superuser.',
          buttons: [[EXIT_ADMIN_BUTTON]],
        };
      }
      const lines = nodes.map((n, i) => `${batch * ROW_SIZE + i + 1}. ${n.title}`);
      const numberButtons = nodes.map((n, i) =>
        button.callback(String(batch * ROW_SIZE + i + 1), `content:node:${n.id}:0`),
      );
      const buttons: Button[][] = chunk(numberButtons, ROW_SIZE);
      const pageRow = paginationRow(batch, totalBatches, (b) => `content:root:${b}`);
      if (pageRow) buttons.push(pageRow);
      buttons.push([EXIT_ADMIN_BUTTON]);
      return { text: ['**Управление контентом**', '', ...lines].join('\n'), buttons };
    }

    case 'node_view': {
      const { node, breadcrumb, children, pages, batch, totalBatches } = result;
      const buttons: Button[][] = [];
      const parts = [heading(breadcrumb, node.title)];

      if (children.length > 0) {
        const lines = children.map((c, i) => `${batch * ROW_SIZE + i + 1}. ${c.title}`);
        parts.push(lines.join('\n'));
        const numberButtons = children.map((c, i) =>
          button.callback(String(batch * ROW_SIZE + i + 1), `content:node:${c.id}:0`),
        );
        buttons.push(...chunk(numberButtons, ROW_SIZE));
        const pageRow = paginationRow(batch, totalBatches, (b) => `content:node:${node.id}:${b}`);
        if (pageRow) buttons.push(pageRow);

        if (pages.length > 0) {
          // Такое бывает, если superuser добавил подкаталог в раздел, где уже были страницы напрямую —
          // они пропадают из публичного меню, пока есть подкаталоги. Не прячем их и здесь, иначе до них
          // никак не добраться, чтобы отредактировать или удалить.
          parts.push(
            `⚠️ Здесь есть ${pages.length} стр. без подкаталога — в публичном меню они сейчас не показываются (пока есть подкаталоги), но управлять ими можно ниже:`,
          );
          pages.forEach((page) => buttons.push([button.callback(`✏️ ${page.title}`, `content:page:${page.id}`)]));
        } else {
          parts.push('Это раздел с подкаталогами — зайдите внутрь нужного, чтобы добавить туда страницы.');
        }
      } else if (pages.length > 0) {
        const lines = pages.map((p, i) => `${batch * ROW_SIZE + i + 1}. ${p.title}`);
        parts.push(lines.join('\n'));
        buttons.push([button.callback('➕ Добавить страницу', `content:add_page:${node.id}`)]);
        const numberButtons = pages.map((p, i) =>
          button.callback(String(batch * ROW_SIZE + i + 1), `content:page:${p.id}`),
        );
        buttons.push(...chunk(numberButtons, ROW_SIZE));
        const pageRow = paginationRow(batch, totalBatches, (b) => `content:node:${node.id}:${b}`);
        if (pageRow) buttons.push(pageRow);
      } else {
        buttons.push([button.callback('➕ Добавить страницу', `content:add_page:${node.id}`)]);
      }

      const backPayload = node.parentId === null ? 'content:root' : `content:node:${node.parentId}:0`;
      const backRow = [button.callback('🔙 Назад', backPayload)];
      if (node.parentId !== null) backRow.push(BACK_TO_ROOT_BUTTON);
      buttons.push(backRow);
      buttons.push([EXIT_ADMIN_BUTTON]);

      return { text: parts.join('\n\n'), buttons };
    }

    case 'page_detail': {
      const { page, attachmentsCount, breadcrumb } = result;
      const backButton = button.callback('🔙 Назад', `content:node:${page.nodeId}:0`);
      return {
        text: [heading(breadcrumb, page.title), '', page.description].join('\n'),
        buttons: [
          [button.callback('✏️ Изменить заголовок', `content:rename_page_title:${page.id}`)],
          [button.callback('✏️ Изменить текст', `content:rename_page_desc:${page.id}`)],
          [button.callback(`📎 Вложения (${attachmentsCount})`, `content:attachments:${page.id}`)],
          [button.callback('🗑️ Удалить страницу', `content:confirm_delete_page:${page.id}`)],
          [backButton],
        ],
      };
    }

    case 'attachment_list': {
      const { pageId, breadcrumb, attachments } = result;
      const backButton = button.callback('🔙 К странице', `content:page:${pageId}`);
      const addButton = button.callback('➕ Добавить фото или документ', `content:add_attachment:${pageId}`);
      const path = heading(breadcrumb, 'Вложения');
      if (attachments.length === 0) {
        return { text: `${path}\n\nПока ничего не прикреплено.`, buttons: [[addButton], [backButton]] };
      }
      const buttons: Button[][] = attachments.map((a) => [
        button.callback(attachmentLabel(a), `content:confirm_delete_attachment:${a.id}`),
      ]);
      buttons.push([addButton]);
      buttons.push([backButton]);
      return { text: `${path}\n\nНажмите на вложение, чтобы удалить:`, buttons };
    }

    case 'attachment_detail':
    case 'not_found':
      return { text: 'Не найдено.', buttons: [[BACK_TO_ROOT_BUTTON]] };
  }
}

export function attachmentLabel(attachment: { type: 'image' | 'file'; filename: string | null }): string {
  return attachment.type === 'image' ? '📷 Фото' : `📄 ${attachment.filename ?? 'Документ'}`;
}

export function buildDeleteConfirmView(
  entityLabel: string,
  entityTitle: string,
  warning: string,
  confirmPayload: string,
  cancelPayload: string,
): StaffView {
  return {
    text: [`Удалить ${entityLabel} «${entityTitle}»?`, '', warning, '', 'Это действие нельзя отменить.'].join('\n'),
    buttons: [[button.callback('✅ Да, удалить', confirmPayload), button.callback('❌ Отмена', cancelPayload)]],
  };
}
