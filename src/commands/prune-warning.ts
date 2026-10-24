import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configReply, failReply } from '../utils/helpers';
import { updateGuildConfig } from '../utils/database';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('prune-warning')
    .setDescription('set the inactivity warning DM')
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
    updateGuildConfig(interaction.guildId, { warningMessage: message });
    await interaction.reply({ content: configReply('updated the prune warning DM', 'saved your custom warning message') });
  },
};

export default command;
