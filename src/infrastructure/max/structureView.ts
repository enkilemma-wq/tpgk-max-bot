import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';
import { StructureResult } from '../../application/use-cases/ManageStructure';
import { StaffView } from './staffView';
import { chunk, paginationRow, ROW_SIZE } from './keyboardHelpers';

const { button } = Keyboard;

function heading(breadcrumb: string[], current: string): string {
  return breadcrumb.length > 0 ? [...breadcrumb, `**${current}**`].join(' › ') : `**${current}**`;
}

const BACK_TO_ROOT_BUTTON = button.callback('🔙 К разделам', 'structure:root');

export function buildStructureView(result: StructureResult): StaffView {
  switch (result.kind) {
    case 'root_list': {
      const { nodes, batch, totalBatches } = result;
      const buttons: Button[][] = [];
      const parts = ['**Структура разделов**'];

      if (nodes.length > 0) {
        const lines = nodes.map((n, i) => `${batch * ROW_SIZE + i + 1}. ${n.title}`);
        parts.push(lines.join('\n'));
        const numberButtons = nodes.map((n, i) =>
          button.callback(String(batch * ROW_SIZE + i + 1), `structure:node:${n.id}:0`),
        );
        buttons.push(...chunk(numberButtons, ROW_SIZE));
        const pageRow = paginationRow(batch, totalBatches, (b) => `structure:root:${b}`);
        if (pageRow) buttons.push(pageRow);
      } else {
        parts.push('Разделов пока нет.');
      }

      buttons.push([button.callback('➕ Добавить раздел', 'structure:add_root')]);
      buttons.push([button.callback('🔙 Панель суперпользователя', 'admin:panel')]);
      return { text: parts.join('\n\n'), buttons };
    }

    case 'node_view': {
      const { node, breadcrumb, children, batch, totalBatches, pageCount } = result;
      const buttons: Button[][] = [];
      // "Этот раздел" — явно про FAQ (текущий, из заголовка), а не про пункты 1/2/3 из списка ниже.
      const parts = [
        heading(breadcrumb, node.title),
        '➕ добавить сюда подкаталог · ✏️ переименовать этот раздел · 🗑️ удалить этот раздел',
      ];

      if (children.length > 0) {
        const lines = children.map((c, i) => `${batch * ROW_SIZE + i + 1}. ${c.title}`);
        parts.push(lines.join('\n'));
        const numberButtons = children.map((c, i) =>
          button.callback(String(batch * ROW_SIZE + i + 1), `structure:node:${c.id}:0`),
        );
        buttons.push(...chunk(numberButtons, ROW_SIZE));
        const pageRow = paginationRow(batch, totalBatches, (b) => `structure:node:${node.id}:${b}`);
        if (pageRow) buttons.push(pageRow);
      } else if (pageCount > 0) {
        // Предупреждаем ДО того, как подкаталог реально добавлен — иначе страницы молча пропадут из меню.
        parts.push(
          `Страниц внутри: ${pageCount}. ⚠️ Если добавить подкаталог, они перестанут показываться в публичном меню, пока подкаталоги не удалены.`,
        );
      }

      // Одна строка на все три действия — иконки самодостаточны, расшифровка вынесена в текст выше.
      buttons.push([
        button.callback('➕', `structure:add_sub:${node.id}`),
        button.callback('✏️', `structure:rename:${node.id}`),
        button.callback('🗑️', `structure:confirm_delete:${node.id}`),
      ]);

      const backPayload = node.parentId === null ? 'structure:root' : `structure:node:${node.parentId}:0`;
      const backRow = [button.callback('🔙 Назад', backPayload)];
      if (node.parentId !== null) backRow.push(BACK_TO_ROOT_BUTTON);
      buttons.push(backRow);

      return { text: parts.join('\n\n'), buttons };
    }

    case 'not_found':
      return { text: 'Не найдено.', buttons: [[BACK_TO_ROOT_BUTTON]] };
  }
}

export function buildStructureDeleteConfirmView(
  nodeTitle: string,
  confirmPayload: string,
  cancelPayload: string,
): StaffView {
  return {
    text: [
      `Удалить раздел «${nodeTitle}»?`,
      '',
      'Вместе с ним удалятся ВСЕ вложенные подкаталоги, страницы и файлы.',
      '',
      'Это действие нельзя отменить.',
    ].join('\n'),
    buttons: [[button.callback('✅ Да, удалить', confirmPayload), button.callback('❌ Отмена', cancelPayload)]],
  };
}
