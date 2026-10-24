import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import pruneConfig from './commands/prune-config';
import pruneWarning from './commands/prune-warning';
import pruneKickMessage from './commands/prune-kickmsg';
import pruneNow from './commands/prune-now';
import pruneStatus from './commands/prune-status';
import webhookProtect from './commands/webhook-protect';
import setLog from './commands/set-log';

async function deployCommands(): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN and CLIENT_ID must be set in .env');
  }

  const body = [
    pruneConfig,
    pruneWarning,
    pruneKickMessage,
    pruneNow,
    pruneStatus,
    webhookProtect,
    setLog,
  ].map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body });
  console.log(`registered ${body.length} slash commands${guildId ? ` in guild ${guildId}` : ' globally'}`);
}

void deployCommands().catch((error: unknown) => {
  console.error('Slash command registration failed:', error);
  process.exitCode = 1;
});
