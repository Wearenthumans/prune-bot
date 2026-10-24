import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { computeNextPruneRun, configReply, failReply, isValidTime } from '../utils/helpers';
import { clearPendingWarnings, getGuildConfig, updateGuildConfig } from '../utils/database';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('prune-config')
    .setDescription('configure the inactive member prune system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((option) =>
      option.setName('threshold').setDescription('messages needed in the rolling window').setMinValue(0).setMaxValue(100_000),
    )
    .addIntegerOption((option) =>
      option.setName('days').setDescription('rolling window and warning grace period').setMinValue(1).setMaxValue(365),
    )
    .addStringOption((option) =>
      option.setName('day').setDescription('day the warning scan runs').addChoices(
        { name: 'every day', value: 'daily' },
        { name: 'every 3 days', value: 'every_3_days' },
        { name: 'monday', value: 'monday' },
        { name: 'tuesday', value: 'tuesday' },
        { name: 'wednesday', value: 'wednesday' },
        { name: 'thursday', value: 'thursday' },
        { name: 'friday', value: 'friday' },
        { name: 'saturday', value: 'saturday' },
        { name: 'sunday', value: 'sunday' },
      ),
    )
    .addStringOption((option) =>
      option.setName('time').setDescription('local bot-host time, 24h HH:MM').setMinLength(5).setMaxLength(5),
    )
    .addBooleanOption((option) => option.setName('enabled').setDescription('enable or disable automatic pruning')),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }

    const current = getGuildConfig(guildId);
    const threshold = interaction.options.getInteger('threshold') ?? current.threshold;
    const windowDays = interaction.options.getInteger('days') ?? current.windowDays;
    const pruneDay = (interaction.options.getString('day') ?? current.pruneDay) as typeof current.pruneDay;
    const pruneTime = interaction.options.getString('time') ?? current.pruneTime;
    const pruneEnabled = interaction.options.getBoolean('enabled') ?? current.pruneEnabled;
    if (!isValidTime(pruneTime)) {
      await interaction.reply({ content: 'uh oh bro check da code — time needs to look like 03:00', ephemeral: true });
      return;
    }

    const nextPruneRun = pruneEnabled ? computeNextPruneRun({ pruneDay, pruneTime }) : null;
    updateGuildConfig(guildId, {
      threshold,
      windowDays,
      pruneDay,
      pruneTime,
      pruneEnabled,
      nextPruneRun,
    });
    if (!pruneEnabled) clearPendingWarnings(guildId);

    await interaction.reply({
      content: configReply(
        `set the prune config for ${interaction.guild?.name ?? 'this server'}`,
        `threshold ${threshold}, rolling window ${windowDays} days, schedule ${pruneDay} at ${pruneTime}, enabled ${pruneEnabled ? 'yes' : 'no'}`,
      ),
    });
  },
};

export default command;
