import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configReply, failReply } from '../utils/helpers';
import { updateGuildConfig } from '../utils/database';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('prune-kickmsg')
    .setDescription('set the DM sent before an inactive member is kicked')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option.setName('message').setDescription('supports {messages}, {days}, {username}, {server}').setMinLength(1).setMaxLength(1000).setRequired(true),
    ),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }
    const message = interaction.options.getString('message', true);
    updateGuildConfig(interaction.guildId, { kickMessage: message });
    await interaction.reply({ content: configReply('updated the inactivity kick DM', 'saved your custom kick message') });
  },
};

export default command;
