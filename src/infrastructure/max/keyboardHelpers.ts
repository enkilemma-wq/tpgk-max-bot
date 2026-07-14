import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';

const { button } = Keyboard;

export const ROW_SIZE = 5;

export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function paginationRow(
  currentPage: number,
  totalPages: number,
  toPayload: (page: number) => string,
): Button[] | null {
  if (totalPages <= 1) return null;
  const row: Button[] = [];
  if (currentPage > 0) {
    row.push(button.callback('<<', toPayload(0)));
    row.push(button.callback('<', toPayload(currentPage - 1)));
  }
  row.push(button.callback(`${currentPage + 1}/${totalPages}`, toPayload(currentPage)));
  if (currentPage < totalPages - 1) {
    row.push(button.callback('>', toPayload(currentPage + 1)));
    row.push(button.callback('>>', toPayload(totalPages - 1)));
  }
  return row;
}
