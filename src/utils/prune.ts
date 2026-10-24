import {
  Client,
  Guild,
  GuildMember,
} from 'discord.js';
import {
  deletePendingWarning,
  getDueWarnings,
  getGuildConfig,
  getMessageCountSince,
  getMessageCountsSince,
  getPendingWarningIds,
  pruneOldActivity,
  updateGuildConfig,
  updateWarningDeadline,
  tryStartPendingWarning,
} from './database';
import { computeNextPruneRun, defaultKickMessage, formatMessage } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 6 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 5 * 60 * 1000;
const ACTIVITY_RETENTION_MS = 366 * DAY_MS;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const activePruneRuns = new Set<string>();
let lastActivityCleanup = 0;

async function sendLog(guild: Guild, channelId: string | null, text: string): Promise<void> {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) ?? await guild.channels.fetch(channelId);
  if (!channel?.isSendable()) {
    throw new Error(`Configured log channel ${channelId} cannot send messages`);
  }
  await channel.send({ content: text, allowedMentions: { parse: [] } });
}

function eligibleForPrune(member: GuildMember): boolean {
  return !member.user.bot && member.id !== member.guild.ownerId;
}

export async function getAtRiskMembers(guild: Guild): Promise<Array<{ member: GuildMember; count: number }>> {
  const config = getGuildConfig(guild.id);
  const members = await guild.members.fetch();
  const counts = getMessageCountsSince(guild.id, Date.now() - config.windowDays * DAY_MS);
  const atRisk: Array<{ member: GuildMember; count: number }> = [];

  for (const member of members.values()) {
    if (!eligibleForPrune(member)) continue;
    const count = counts.get(member.id) ?? 0;
    if (count < config.threshold) atRisk.push({ member, count });
  }
  return atRisk;
}

async function processDueWarnings(guild: Guild): Promise<number> {
  const config = getGuildConfig(guild.id);
  const dueWarnings = getDueWarnings(guild.id);
  let kicked = 0;

  for (const warning of dueWarnings) {
    const member = await guild.members.fetch(warning.userId).catch((error: unknown) => {
      console.warn(`Could not fetch warned member ${warning.userId} in ${guild.id}:`, error);
      return null;
    });
    if (!member || !eligibleForPrune(member)) {
      deletePendingWarning(guild.id, warning.userId);
      continue;
    }

    const earnedMessages = getMessageCountSince(guild.id, member.id, warning.warnedAt);
    if (earnedMessages >= config.threshold) {
      deletePendingWarning(guild.id, member.id);
      continue;
    }

    const kickMessage = formatMessage(config.kickMessage || defaultKickMessage, {
      messages: config.threshold,
      days: config.windowDays,
      username: member.user.username,
      server: guild.name,
    });

    try {
      await member.send({ content: kickMessage, allowedMentions: { parse: [] } });
    } catch (error) {
      console.warn(`Could not DM member ${member.id} before inactivity kick:`, error);
    }

    try {
      await member.kick('Inactive member prune after warning period');
    } catch (error) {
      console.error(`Could not kick inactive member ${member.id} in ${guild.id}:`, error);
      updateWarningDeadline(guild.id, member.id, Date.now() + RETRY_MS);
      continue;
    }

    deletePendingWarning(guild.id, member.id);
    kicked += 1;
    await sendLog(
      guild,
      config.generalLogChannelId,
      `inactive prune: ${member.user.tag} got kicked after ${earnedMessages} messages in ${config.windowDays} days`,
    ).catch((error: unknown) => console.error(`Could not log inactivity kick in ${guild.id}:`, error));
  }

  return kicked;
}

async function warnNewAtRiskMembers(guild: Guild): Promise<number> {
  const config = getGuildConfig(guild.id);
  const atRisk = await getAtRiskMembers(guild);
  const now = Date.now();
  const pendingIds = getPendingWarningIds(guild.id);
  let warned = 0;

  for (const { member } of atRisk) {
    if (pendingIds.has(member.id)) continue;
    if (!tryStartPendingWarning(guild.id, member.id, now, now + config.windowDays * DAY_MS)) continue;

    const message = formatMessage(config.warningMessage, {
      messages: config.threshold,
      days: config.windowDays,
      username: member.user.username,
      server: guild.name,
    });
    try {
      await member.send({ content: message, allowedMentions: { parse: [] } });
    } catch (error) {
      console.warn(`Could not DM inactivity warning to member ${member.id}:`, error);
    }

    warned += 1;
  }
  return warned;
}

export async function runPruneCheck(
  guild: Guild,
  scanForNewWarnings = true,
): Promise<{ warned: number; kicked: number }> {
  const config = getGuildConfig(guild.id);
  if (!config.pruneEnabled) return { warned: 0, kicked: 0 };
  if (activePruneRuns.has(guild.id)) {
    throw new Error(`A prune check is already running for guild ${guild.id}`);
  }

  activePruneRuns.add(guild.id);
  try {
    const kicked = await processDueWarnings(guild);
    const warned = scanForNewWarnings ? await warnNewAtRiskMembers(guild) : 0;
    pruneOldActivity(Date.now() - ACTIVITY_RETENTION_MS);
    return { warned, kicked };
  } finally {
    activePruneRuns.delete(guild.id);
  }
}

let schedulerTickRunning = false;

export function startPruneScheduler(client: Client): NodeJS.Timeout {
  return setInterval(() => {
    if (schedulerTickRunning) return;
    schedulerTickRunning = true;
    void tickPruneScheduler(client).catch((error: unknown) => {
      console.error('Prune scheduler failed:', error);
    }).finally(() => {
      schedulerTickRunning = false;
    });
  }, 60_000);
}

async function tickPruneScheduler(client: Client): Promise<void> {
  const now = Date.now();
  if (now - lastActivityCleanup >= CLEANUP_INTERVAL_MS) {
    pruneOldActivity(now - ACTIVITY_RETENTION_MS);
    lastActivityCleanup = now;
  }

  for (const guild of client.guilds.cache.values()) {
    const config = getGuildConfig(guild.id);
    if (!config.pruneEnabled) continue;

    const scheduledRun = config.nextPruneRun;
    const missingSchedule = scheduledRun === null;
    const due = scheduledRun !== null && scheduledRun <= now;
    if (due) {
      updateGuildConfig(guild.id, { nextPruneRun: computeNextPruneRun(config) });
    } else if (missingSchedule) {
      updateGuildConfig(guild.id, { nextPruneRun: computeNextPruneRun(config) });
    }

    try {
      await runPruneCheck(guild, due);
    } catch (error) {
      console.error(`Prune check failed for guild ${guild.id}:`, error);
      if (due) {
        updateGuildConfig(guild.id, { nextPruneRun: Date.now() + ERROR_RETRY_MS });
      }
      await sendLog(guild, config.generalLogChannelId, 'uh oh bro check da code')
        .catch((logError: unknown) => console.error(`Could not log prune error for ${guild.id}:`, logError));
    }
  }
}
