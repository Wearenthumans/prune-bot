import type { ChatInputCommandInteraction, Collection } from 'discord.js';
import type { SlashCommand } from '../types';
import { failReply } from '../utils/helpers';

export async function onInteractionCreate(
  interaction: ChatInputCommandInteraction,
  commands: Collection<string, SlashCommand>,
): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command /${interaction.commandName} failed:`, error);
    const payload = { content: failReply(), ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch((replyError: unknown) => {
        console.error('Could not send command error response:', replyError);
      });
    } else {
      await interaction.reply(payload).catch((replyError: unknown) => {
        console.error('Could not send command error response:', replyError);
      });
    }
  }
}
