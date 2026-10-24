import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configReply, failReply } from '../utils/helpers';
import { getGuildConfig } from '../utils/database';
import { runPruneCheck } from '../utils/prune';
import type { SlashCommand } from '../types';

const command: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('prune-now')
    .setDescription('run the inactivity check and send warnings now')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: failReply(), ephemeral: true });
      return;
    }
    if (!getGuildConfig(guild.id).pruneEnabled) {
      await interaction.reply({ content: 'pruning is off rn 👍', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const result = await runPruneCheck(guild, true);
    await interaction.editReply({
      content: configReply(
        'ran the inactivity check',
        `sent ${result.warned} warning(s), kicked ${result.kicked} member(s) whose warning period had ended`,
      ),
    });
  },
};

export default command;
