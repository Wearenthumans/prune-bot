import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configReply, failReply } from '../utils/helpers';
import { getGuildConfig, updateGuildConfig } from '../utils/database';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('webhook-protect')
    .setDescription('configure webhook creation protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) => option.setName('enabled').setDescription('enable or disable protection'))
    .addRoleOption((option) => option.setName('role').setDescription('role allowed to create webhooks'))
    .addBooleanOption((option) => option.setName('clear-role').setDescription('remove the allowed role'))
    .addChannelOption((option) =>
      option
        .setName('log-channel')
        .setDescription('channel for the exact protection log message')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addBooleanOption((option) => option.setName('clear-log').setDescription('remove the webhook log channel')),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }
    const config = getGuildConfig(interaction.guildId);
    const enabled = interaction.options.getBoolean('enabled') ?? config.webhookProtectionEnabled;
    const role = interaction.options.getRole('role');
    const clearRole = interaction.options.getBoolean('clear-role') ?? false;
    const logChannel = interaction.options.getChannel('log-channel');
    const clearLog = interaction.options.getBoolean('clear-log') ?? false;
    if ((role && clearRole) || (logChannel && clearLog)) {
      await interaction.reply({ content: 'uh oh bro check da code — pick a value or clear it, not both', ephemeral: true });
      return;
    }

    const finalLogChannelId = clearLog ? null : logChannel?.id ?? config.webhookLogChannelId;
    if (enabled && !finalLogChannelId) {
      await interaction.reply({ content: 'set a webhook log channel before turning protection on 👍', ephemeral: true });
      return;
    }

    updateGuildConfig(interaction.guildId, {
      webhookProtectionEnabled: enabled,
      webhookRoleId: clearRole ? null : role?.id ?? config.webhookRoleId,
      webhookLogChannelId: finalLogChannelId,
    });
    await interaction.reply({
      content: configReply(
        'updated webhook protection',
        `enabled ${enabled ? 'yes' : 'no'}, allowed role ${clearRole ? 'cleared' : role?.name ?? 'unchanged'}, log ${clearLog ? 'cleared' : logChannel?.name ?? 'unchanged'}`,
      ),
    });
  },
};

export default command;
