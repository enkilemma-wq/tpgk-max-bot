import { Bot } from '@maxhub/max-bot-api';
import { MessageSender } from '../../domain/ports/MessageSender';

export class MaxMessageSender implements MessageSender {
  constructor(private readonly bot: Bot) {}

  async sendToChat(chatId: number, text: string): Promise<void> {
    await this.bot.api.sendMessageToChat(chatId, text, { format: 'markdown' });
  }
}
