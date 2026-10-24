import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

export type PruneDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'
  | 'daily'
  | 'every_3_days';

export type GuildConfig = {
  guildId: string;
  threshold: number;
  windowDays: number;
  pruneDay: PruneDay;
  pruneTime: string;
  pruneEnabled: boolean;
  warningMessage: string;
  kickMessage: string;
  generalLogChannelId: string | null;
  webhookProtectionEnabled: boolean;
  webhookRoleId: string | null;
  webhookLogChannelId: string | null;
  nextPruneRun: number | null;
};

export type SlashCommand = {
  data: {
    name: string;
    toJSON(): ReturnType<SlashCommandBuilder['toJSON']>;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
};
