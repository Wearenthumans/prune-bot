import type { Client } from 'discord.js';
import { computeNextPruneRun } from '../utils/helpers';
import { getGuildConfig, updateGuildConfig } from '../utils/database';
import { startPruneScheduler } from '../utils/prune';

export function onReady(client: Client): void {
  console.log(`bot online: ${client.user?.tag ?? 'unknown user'}`);
  for (const guild of client.guilds.cache.values()) {
    const config = getGuildConfig(guild.id);
    if (config.pruneEnabled && config.nextPruneRun === null) {
      updateGuildConfig(guild.id, { nextPruneRun: computeNextPruneRun(config) });
    }
  }
  startPruneScheduler(client);
}
