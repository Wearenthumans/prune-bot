import type { Message } from 'discord.js';
import { recordMessage } from '../utils/database';

export function onMessageCreate(message: Message): void {
  if (!message.guild || message.author.bot || message.webhookId) return;
  try {
    recordMessage(message.guild.id, message.author.id, message.createdTimestamp);
  } catch (error) {
    console.error(`Could not record message activity for guild ${message.guild.id}:`, error);
  }
}
