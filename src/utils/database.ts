import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { GuildConfig, PruneDay } from '../types';

const dataDirectory = path.resolve(process.env.DATA_DIRECTORY ?? 'data');
fs.mkdirSync(dataDirectory, { recursive: true });

// Render's free filesystem is ephemeral; this SQLite database is erased on restart/redeploy.
// Use Render Postgres or a paid persistent disk before relying on this data in production.
export const database = new DatabaseSync(path.join(dataDirectory, 'bot.sqlite'));
database.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id TEXT PRIMARY KEY,
    threshold INTEGER NOT NULL DEFAULT 50 CHECK (threshold >= 0),
    window_days INTEGER NOT NULL DEFAULT 3 CHECK (window_days BETWEEN 1 AND 365),
    prune_day TEXT NOT NULL DEFAULT 'monday',
    prune_time TEXT NOT NULL DEFAULT '03:00',
    prune_enabled INTEGER NOT NULL DEFAULT 0,
    warning_message TEXT NOT NULL DEFAULT 'yo im finna kick u if you dont get {messages} messages in the next {days} days',
    kick_message TEXT NOT NULL DEFAULT '',
    general_log_channel_id TEXT,
    webhook_protection_enabled INTEGER NOT NULL DEFAULT 0,
    webhook_role_id TEXT,
    webhook_log_channel_id TEXT,
    next_prune_run INTEGER
  );

  CREATE TABLE IF NOT EXISTS activity_messages (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_by_guild_user_time
    ON activity_messages (guild_id, user_id, created_at);
  CREATE INDEX IF NOT EXISTS activity_by_guild_time_user
    ON activity_messages (guild_id, created_at, user_id);
  CREATE INDEX IF NOT EXISTS activity_by_time
    ON activity_messages (created_at);

  CREATE TABLE IF NOT EXISTS pending_warnings (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    warned_at INTEGER NOT NULL,
    deadline_at INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS pending_warnings_by_deadline
    ON pending_warnings (deadline_at);
`);

const defaultWarning =
  'yo im finna kick u if you dont get {messages} messages in the next {days} days';
const defaultKick =
  "I will serve as Heaven's justice. I will kill.\ndiscord.gg/ruining\nyou can join back here if u want";

type GuildRow = {
  guild_id: string;
  threshold: number;
  window_days: number;
  prune_day: PruneDay;
  prune_time: string;
  prune_enabled: number;
  warning_message: string;
  kick_message: string;
  general_log_channel_id: string | null;
  webhook_protection_enabled: number;
  webhook_role_id: string | null;
  webhook_log_channel_id: string | null;
  next_prune_run: number | null;
};

function mapConfig(row: GuildRow): GuildConfig {
  return {
    guildId: row.guild_id,
    threshold: row.threshold,
    windowDays: row.window_days,
    pruneDay: row.prune_day,
    pruneTime: row.prune_time,
    pruneEnabled: row.prune_enabled === 1,
    warningMessage: row.warning_message,
    kickMessage: row.kick_message,
    generalLogChannelId: row.general_log_channel_id,
    webhookProtectionEnabled: row.webhook_protection_enabled === 1,
    webhookRoleId: row.webhook_role_id,
    webhookLogChannelId: row.webhook_log_channel_id,
    nextPruneRun: row.next_prune_run,
  };
}

export function getGuildConfig(guildId: string): GuildConfig {
  database.prepare(`
    INSERT INTO guild_settings (guild_id, warning_message, kick_message) VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO NOTHING
  `).run(guildId, defaultWarning, defaultKick);
  const row = database.prepare('SELECT * FROM guild_settings WHERE guild_id = ?').get(guildId) as GuildRow;
  return mapConfig(row);
}

export function updateGuildConfig(
  guildId: string,
  updates: Partial<Omit<GuildConfig, 'guildId'>>,
): GuildConfig {
  const config = { ...getGuildConfig(guildId), ...updates };
  database.prepare(`
    UPDATE guild_settings SET
      threshold = ?,
      window_days = ?,
      prune_day = ?,
      prune_time = ?,
      prune_enabled = ?,
      warning_message = ?,
      kick_message = ?,
      general_log_channel_id = ?,
      webhook_protection_enabled = ?,
      webhook_role_id = ?,
      webhook_log_channel_id = ?,
      next_prune_run = ?
    WHERE guild_id = ?
  `).run(
    config.threshold,
    config.windowDays,
    config.pruneDay,
    config.pruneTime,
    Number(config.pruneEnabled),
    config.warningMessage,
    config.kickMessage,
    config.generalLogChannelId,
    Number(config.webhookProtectionEnabled),
    config.webhookRoleId,
    config.webhookLogChannelId,
    config.nextPruneRun,
    guildId,
  );
  return config;
}

const insertMessage = database.prepare(
  'INSERT INTO activity_messages (guild_id, user_id, created_at) VALUES (?, ?, ?)',
);

export function recordMessage(guildId: string, userId: string, timestamp = Date.now()): void {
  insertMessage.run(guildId, userId, timestamp);
}

const countMessagesSince = database.prepare(`
  SELECT COUNT(*) AS count
  FROM activity_messages
  WHERE guild_id = ? AND user_id = ? AND created_at >= ?
`);

export function getMessageCountSince(guildId: string, userId: string, since: number): number {
  return Number((countMessagesSince.get(guildId, userId, since) as { count: number }).count);
}

const countMessagesByUserSince = database.prepare(`
  SELECT user_id, COUNT(*) AS count
  FROM activity_messages
  WHERE guild_id = ? AND created_at >= ?
  GROUP BY user_id
`);

export function getMessageCountsSince(guildId: string, since: number): Map<string, number> {
  const rows = countMessagesByUserSince.all(guildId, since) as Array<{
    user_id: string;
    count: number;
  }>;
  return new Map(rows.map((row) => [row.user_id, Number(row.count)]));
}

export function tryStartPendingWarning(
  guildId: string,
  userId: string,
  warnedAt: number,
  deadlineAt: number,
): boolean {
  const result = database.prepare(`
    INSERT OR IGNORE INTO pending_warnings (guild_id, user_id, warned_at, deadline_at)
    VALUES (?, ?, ?, ?)
  `).run(guildId, userId, warnedAt, deadlineAt);
  return result.changes === 1;
}

export function getDueWarnings(guildId: string, now = Date.now()): Array<{
  userId: string;
  warnedAt: number;
}> {
  const rows = database.prepare(`
    SELECT user_id, warned_at
    FROM pending_warnings
    WHERE guild_id = ? AND deadline_at <= ?
    ORDER BY deadline_at ASC
  `).all(guildId, now) as Array<{ user_id: string; warned_at: number }>;
  return rows.map((row) => ({ userId: row.user_id, warnedAt: row.warned_at }));
}

export function getPendingWarningIds(guildId: string): Set<string> {
  const rows = database.prepare(
    'SELECT user_id FROM pending_warnings WHERE guild_id = ?',
  ).all(guildId) as Array<{ user_id: string }>;
  return new Set(rows.map((row) => row.user_id));
}

export function deletePendingWarning(guildId: string, userId: string): void {
  database.prepare('DELETE FROM pending_warnings WHERE guild_id = ? AND user_id = ?')
    .run(guildId, userId);
}

export function clearPendingWarnings(guildId: string): void {
  database.prepare('DELETE FROM pending_warnings WHERE guild_id = ?').run(guildId);
}

export function updateWarningDeadline(guildId: string, userId: string, deadlineAt: number): void {
  database.prepare(`
    UPDATE pending_warnings SET deadline_at = ?
    WHERE guild_id = ? AND user_id = ?
  `).run(deadlineAt, guildId, userId);
}

export function pruneOldActivity(keepSince: number): void {
  database.prepare('DELETE FROM activity_messages WHERE created_at < ?').run(keepSince);
}

export function closeDatabase(): void {
  database.close();
}
