import type { GuildConfig, PruneDay } from '../types';

const weekdayIndex: Record<Exclude<PruneDay, 'daily' | 'every_3_days'>, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function computeNextPruneRun(
  config: Pick<GuildConfig, 'pruneDay' | 'pruneTime'>,
  from = new Date(),
): number {
  if (!isValidTime(config.pruneTime)) {
    throw new Error('Prune time must use HH:MM in 24-hour format');
  }
  const [hour, minute] = config.pruneTime.split(':').map(Number);
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);

  if (config.pruneDay === 'daily') {
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  if (config.pruneDay === 'every_3_days') {
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 3);
    return next.getTime();
  }

  const offset =
    (weekdayIndex[config.pruneDay] - from.getDay() + 7) % 7 ||
    (next.getTime() <= from.getTime() ? 7 : 0);
  next.setDate(next.getDate() + offset);
  return next.getTime();
}

export function formatMessage(
  template: string,
  values: Record<'messages' | 'days' | 'username' | 'server', string | number>,
): string {
  return template.replace(/\{(messages|days|username|server)\}/g, (_match, key: keyof typeof values) =>
    String(values[key]),
  );
}

export function configReply(what: string, changes: string): string {
  return `ok i did this: ${what}\nand then for these changes i did this: ${changes} 👍`;
}

export function failReply(): string {
  return 'uh oh bro check da code';
}

export const defaultWarningMessage =
  'yo im finna kick u if you dont get {messages} messages in the next {days} days';
export const defaultKickMessage =
  "I will serve as Heaven's justice. I will kill.\ndiscord.gg/ruining\nyou can join back here if u want";
