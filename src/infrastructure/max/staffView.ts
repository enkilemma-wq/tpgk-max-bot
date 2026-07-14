import { Keyboard } from '@maxhub/max-bot-api';
import { Button } from '@maxhub/max-bot-api/types';

const { button } = Keyboard;

export interface StaffView {
  text: string;
  buttons?: Button[][];
}

export function buildPromptView(text: string, cancelPayload: string): StaffView {
  return { text, buttons: [[button.callback('❌ Отменить', cancelPayload)]] };
}

export function buildConfirmationView(prefix: string, next: StaffView): StaffView {
  return { text: `${prefix}\n\n${next.text}`, buttons: next.buttons };
}
