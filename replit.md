# MenaxTech Telegram Bot

## Overview
An advanced Telegram Bot for boosting channel posts with a referral system and premium features. Built with Node.js using the `node-telegram-bot-api` library.

## Architecture
- **Runtime**: Node.js (ESM modules, `"type": "module"`)
- **Entry point**: `bot.js`
- **Database**: File-based JSON (`database.json`) — no external DB needed
- **No frontend** — this is a pure background service bot

## Key Files
- `bot.js` — Main bot logic, event handlers
- `commands.js` — Command processing (admin & user commands)
- `handlers.js` — UserHandler, AdminHandler, ChannelHandler
- `database.js` — File-based JSON database with backup support
- `utils.js` — Logger, MessageFormatter, TimeHelper utilities
- `config.js` — Configuration loaded from environment variables

## Environment Variables / Secrets Required
- `TELEGRAM_BOT_TOKEN` (secret) — Telegram bot token from @BotFather
- `ADMIN_USER_ID` (secret) — Telegram user ID of the admin

## Optional Config (has defaults in `.env`)
- `BOT_USERNAME`, `BITRAHQ_API_KEY`, `CHANNEL_1`, `CHANNEL_2`
- `DAILY_POINTS`, `FREE_VIEWS_LIMIT`, `PREMIUM_VIEWS_LIMIT`, etc.

## Workflow
- **Start application** — `node bot.js` (console output, no port)

## Features
- Channel membership verification before bot access
- Referral system with points rewards
- Daily points claiming
- View/reaction boosting via external API (bitrahq)
- Premium membership (buy with points or bank transfer)
- Admin panel with user management, stats, ban/unban, redeem codes
