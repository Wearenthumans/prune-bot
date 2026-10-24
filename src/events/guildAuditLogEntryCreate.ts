import { AuditLogEvent, Guild, GuildAuditLogsEntry } from 'discord.js';
import { getGuildConfig } from '../utils/database';

const WEBHOOK_ALERT = 'bro tried to make a webhook gg ez';

export async function onGuildAuditLogEntryCreate(
  entry: GuildAuditLogsEntry,
  guild: Guild,
): Promise<void> {
  if (entry.action !== AuditLogEvent.WebhookCreate || !entry.executorId || !entry.targetId) return;

  const config = getGuildConfig(guild.id);
  if (!config.webhookProtectionEnabled) return;

  let shouldLog = true;
  try {
    const executor = await guild.members.fetch(entry.executorId);
    if (
      executor.user.bot ||
      executor.id === guild.ownerId ||
      (config.webhookRoleId && executor.roles.cache.has(config.webhookRoleId))
    ) {
      shouldLog = false;
      return;
    }

    let createdWebhook = null;
    try {
      createdWebhook = (await guild.fetchWebhooks()).get(entry.targetId) ?? null;
    } catch (error) {
      console.error(`Could not fetch webhook ${entry.targetId}:`, error);
    }
    if (createdWebhook) {
      await createdWebhook.delete('Unauthorized webhook creation').catch((error: unknown) => {
        console.error(`Could not delete webhook ${entry.targetId}:`, error);
      });
    } else {
      console.error(`Created webhook ${entry.targetId} was not found in guild ${guild.id}`);
    }

    const rolesToRemove = executor.roles.cache.filter(
      (role) => role.id !== guild.id && !role.managed && role.editable,
    );
    if (rolesToRemove.size > 0) {
      await executor.roles.remove([...rolesToRemove.keys()], 'Unauthorized webhook creation')
        .catch((error: unknown) => {
          console.error(`Could not remove roles from webhook creator ${executor.id}:`, error);
        });
    }
  } catch (error) {
    console.error(`Webhook protection failed for guild ${guild.id}:`, error);
  } finally {
    if (shouldLog && config.webhookLogChannelId) {
      try {
        const channel =
          guild.channels.cache.get(config.webhookLogChannelId) ??
          await guild.channels.fetch(config.webhookLogChannelId);
        if (channel && 'send' in channel && typeof channel.send === 'function') {
          await channel.send({ content: WEBHOOK_ALERT, allowedMentions: { parse: [] } });
        } else {
          console.error(`Webhook log channel ${config.webhookLogChannelId} is not sendable`);
        }
      } catch (error) {
        console.error(`Could not write webhook protection log for guild ${guild.id}:`, error);
      }
    }
  }
}
