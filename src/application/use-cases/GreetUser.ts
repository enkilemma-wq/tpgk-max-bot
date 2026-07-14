import { MessageSender } from '../../domain/ports/MessageSender';

export class GreetUser {
  constructor(private readonly messageSender: MessageSender) {}

  async execute(chatId: number, name: string): Promise<void> {
    const text = [
      `👋 Здравствуйте, ${name}!`,
      '',
      'Это бот приёмной комиссии Томского промышленно-гуманитарного колледжа для абитуриентов.',
      '',
      'Здесь можно посмотреть:',
      '📚 специальности и сроки обучения',
      '📝 как поступить и куда обращаться',
      '❓ ответы на частые вопросы',
      '',
      'Выбирайте раздел ниже — цифрой или кнопкой.',
    ].join('\n');
    await this.messageSender.sendToChat(chatId, text);
  }
}
