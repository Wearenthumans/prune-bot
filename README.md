# Discord prune bot

A self-hosted Discord.js v14 bot using TypeScript, slash commands, and SQLite (`node:sqlite`).

## Requirements

- Node.js 22.13 or newer (`node:sqlite` is used directly)
- A Discord application and bot
- The **Server Members Intent** and **Message Content Intent** enabled in the Discord Developer Portal

## Setup

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `CLIENT_ID`. `GUILD_ID` is optional and registers commands to one server for faster testing; omit it to register globally.
2. Install dependencies: `npm install`
3. Register slash commands: `npm run deploy`
4. Start the bot: `npm start` (or use `npm run dev` while developing).

SQLite files are written under `data/` by default. Set `DATA_DIRECTORY` to change that location. Keep the database directory on persistent storage and back it up while the bot is stopped.

> **Render storage warning:** Render's free filesystem is ephemeral. The SQLite database will be erased when the service restarts or redeploys, including message activity, settings, and pending warnings. For production use Render Postgres (recommended) or attach a paid persistent disk and set `DATA_DIRECTORY` to its mount path.

## Deploy to Render

1. Push this project to a Git repository you control.
2. In Render, create a new Blueprint and connect that repository. Render reads `render.yaml` and creates the `discord-prune-bot` background worker.
3. In the service's Environment settings, set `DISCORD_TOKEN` and `CLIENT_ID` to your current bot token and Discord application ID. Do not commit `.env` or put secrets in `render.yaml`.
4. Confirm the service uses Node.js 22.13 or newer. The Blueprint sets `NODE_VERSION=22.13.0` because this project uses `node:sqlite`; Node 18 cannot run this database implementation.
5. Deploy. Render runs `npm install && npm run build` and starts the worker with `npm start`.
6. Register the slash commands once using the same bot token and application ID: set them in your local `.env`, then run `npm run deploy`. Set `GUILD_ID` locally for quick guild registration, or leave it unset to register globally. Do not add `GUILD_ID` to Render unless you specifically want the deploy script to be run there.
7. Invite the bot with the `bot` and `applications.commands` scopes, enable the required privileged intents in the Discord Developer Portal, and grant only the permissions listed below.
8. In Discord, configure `/webhook-protect` with a log channel before enabling it, and enable pruning only after reviewing `/prune-config`. Both destructive features are disabled by default.

The worker remains online while connected to Discord. The free filesystem is still temporary: use Postgres or a persistent disk if you need counts and settings to survive restarts.

## Discord setup

Invite the bot with the `bot` and `applications.commands` scopes. Give it only the permissions it needs:

- View Channels, Send Messages, Read Message History
- View Audit Log
- Kick Members
- Manage Webhooks
- Manage Roles

The bot's highest role must be above roles it is expected to remove or members it is expected to kick. The guild owner, bots, and users with the configured webhook-authority role are exempt from webhook enforcement. The bot cannot remove managed roles or roles above its own highest role.

Enable `GuildMembers` and `MessageContent` under **Privileged Gateway Intents** in the Developer Portal. Without these, member enumeration or message counting will not work as intended.

## Pruning behavior

- Every non-bot, non-webhook guild message is recorded with its timestamp in SQLite.
- The inactivity count is a true rolling query over the configured number of days. Messages are retained for up to 366 days.
- A scheduled check DMs at-risk members and starts a grace period equal to the configured window. At the deadline, the bot kicks only if the member did not reach the message threshold during that grace period. DMs are best-effort; members with closed DMs still enter the grace period.
- `/prune-now` performs that same check immediately; it does not skip or shorten a pending warning's grace period.
- Weekly/daily schedule times use the bot host's local timezone. Keep the host clock and timezone configured correctly.
- Counts begin when the bot is online and has access to messages; Discord does not provide a historical message-count backfill through the gateway.

Run `/prune-config` to set the threshold, rolling window/grace period, schedule, and enabled state. Use `/prune-warning`, `/prune-kickmsg`, `/prune-status`, `/webhook-protect`, and `/set-log` for the other settings. Administrator permission is required for configuration and manual runs.

Pruning and webhook protection both start disabled so the bot cannot kick members or strip roles before an administrator opts in. Set the webhook log channel before enabling webhook protection.

## Slash commands

- `/prune-config`
- `/prune-warning`
- `/prune-kickmsg`
- `/prune-now`
- `/prune-status`
- `/webhook-protect`
- `/set-log`

Warning and kick message placeholders: `{messages}`, `{days}`, `{username}`, `{server}`.

Webhook handling listens for the precise webhook-create audit event, deletes that webhook, removes all editable non-managed roles from the creator, and posts exactly `bro tried to make a webhook gg ez` to the configured protection log channel. Missing permissions, inaccessible logs, and Discord API errors are logged to the console.
