# Telegram Shop Bot

## Overview
A fully-featured Telegram shop bot for selling digital products, services, physical goods, and subscriptions. Customers browse products, place orders, and send payment receipts — all within Telegram.

## Architecture
- **Runtime**: Node.js (ESM modules, `"type": "module"`)
- **Entry point**: `bot.js`
- **Database**: File-based JSON (`database.json`) — no external DB needed
- **No frontend** — pure Telegram bot backend service

## Key Files
- `bot.js` — Main bot: menus, callbacks, conversation state machine
- `handlers.js` — ProductHandler, OrderHandler, AdminHandler
- `database.js` — JSON file database with auto-migration and backup
- `utils.js` — Logger, MessageFormatter, TimeHelper, ValidationHelper
- `commands.js` — Slash commands (/ban, /stats, /broadcast, /orders, etc.)
- `config.js` — All config loaded from environment variables

## Shop Categories
- 📚 Digital Products
- 🛠️ Services
- 📦 Physical Goods
- ⭐ Subscriptions

## Order Flow
1. User browses category → selects product → taps "Order Now"
2. User enters quantity → bot shows order summary + payment details
3. User pays and sends payment screenshot
4. Admin receives screenshot notification
5. Admin confirms/cancels from admin panel
6. User notified of confirmation/delivery

## Admin Features
- Add/disable/delete products with 5-step guided flow
- View pending & all orders, confirm/cancel/deliver
- View user list
- Update bank payment details
- View store statistics
- `/broadcast <message>` — send to all users
- `/ban` / `/unban` / `/addadmin` / `/removeadmin`

## Environment Variables / Secrets Required
- `TELEGRAM_BOT_TOKEN` (secret) — from @BotFather
- `ADMIN_USER_ID` (secret) — your Telegram numeric user ID
- `BOT_USERNAME` (secret) — your bot's @username

## Optional Config (set via Replit Secrets)
- `SHOP_NAME` — Display name of the shop (default: "🛍️ MyShop")
- `CURRENCY` — Currency code (default: "USD")
- `CURRENCY_SYMBOL` — Currency symbol (default: "$")
- `SUPPORT_USERNAME` — Support Telegram username shown to users
- `ABOUT_TEXT` — About text shown in the About section

## Workflow
- **Start application** — `node bot.js` (console output)
