export interface MessageSender {
  sendToChat(chatId: number, text: string): Promise<void>;
}
