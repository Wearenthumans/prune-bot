import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configReply, failReply } from '../utils/helpers';
import { getGuildConfig, updateGuildConfig } from '../utils/database';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('set-log')
    .setDescription('set or clear the general log channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option.setName('channel').setDescription('general event log destination').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addBooleanOption((option) => option.setName('clear').setDescription('clear the current log channel')),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel('channel');
    const clear = interaction.options.getBoolean('clear') ?? false;
    if ((!channel && !clear) || (channel && clear)) {
      await interaction.reply({ content: 'uh oh bro check da code — choose a channel or set clear to true', ephemeral: true });
      return;
    }
    const current = getGuildConfig(interaction.guildId);
    updateGuildConfig(interaction.guildId, {
      generalLogChannelId: clear ? null : channel?.id ?? current.generalLogChannelId,
    });
    await interaction.reply({
      content: configReply('updated the general log channel', clear ? 'cleared it' : `set it to ${channel?.name}`),
    });
  },
};

export default command;
