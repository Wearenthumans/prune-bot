import 'dotenv/config';
import {
  AuditLogEvent,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
} from 'discord.js';
import type { SlashCommand } from './types';
import pruneConfig from './commands/prune-config';
import pruneWarning from './commands/prune-warning';
import pruneKickMessage from './commands/prune-kickmsg';
import pruneNow from './commands/prune-now';
import pruneStatus from './commands/prune-status';
import webhookProtect from './commands/webhook-protect';
import setLog from './commands/set-log';
import { onGuildAuditLogEntryCreate } from './events/guildAuditLogEntryCreate';
import { onInteractionCreate } from './events/interactionCreate';
import { onMessageCreate } from './events/messageCreate';
import { onReady } from './events/ready';
import { closeDatabase, getGuildConfig, updateGuildConfig } from './utils/database';
import { computeNextPruneRun } from './utils/helpers';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildWebhooks,
  ],
});

const commands = new Collection<string, SlashCommand>(
  [
    pruneConfig,
    pruneWarning,
    pruneKickMessage,
    pruneNow,
    pruneStatus,
    webhookProtect,
    setLog,
  ].map((command) => [command.data.name, command]),
);

client.once(Events.ClientReady, (readyClient) => onReady(readyClient));
client.on(Events.MessageCreate, onMessageCreate);
client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) {
    void onInteractionCreate(interaction, commands);
  }
});
client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
  if (entry.action === AuditLogEvent.WebhookCreate) {
    void onGuildAuditLogEntryCreate(entry, guild);
  }
});
client.on(Events.GuildCreate, (guild) => {
  const config = getGuildConfig(guild.id);
  if (config.pruneEnabled && config.nextPruneRun === null) {
    updateGuildConfig(guild.id, { nextPruneRun: computeNextPruneRun(config) });
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    client.destroy();
    closeDatabase();
    process.exit(0);
  });
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
  throw new Error('DISCORD_TOKEN is missing. Copy .env.example to .env and set your bot token.');
}

client.login(token).catch((error: unknown) => {
  console.error('Discord login failed:', error);
  closeDatabase();
  process.exitCode = 1;
});
