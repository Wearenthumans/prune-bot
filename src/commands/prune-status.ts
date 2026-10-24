import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getGuildConfig } from '../utils/database';
import { getAtRiskMembers } from '../utils/prune';
import { failReply } from '../utils/helpers';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('prune-status')
    .setDescription('show prune settings and rolling-window risk count')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) => option.setName('public').setDescription('show the status publicly')),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: !interaction.options.getBoolean('public') });
    const config = getGuildConfig(guild.id);
    const atRisk = await getAtRiskMembers(guild);
    const nextRun = config.nextPruneRun
      ? new Date(config.nextPruneRun).toLocaleString()
      : 'not scheduled';
    await interaction.editReply(
      `prune status 👍\nenabled: ${config.pruneEnabled ? 'yes' : 'no'}\nthreshold: ${config.threshold} messages in ${config.windowDays} days\nschedule: ${config.pruneDay} at ${config.pruneTime} (bot host local time)\nnext run: ${nextRun}\nat risk right now: ${atRisk.length}`,
    );
  },
};

export default command;
