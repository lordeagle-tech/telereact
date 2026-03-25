import dotenv from 'dotenv';
dotenv.config();

export const config = {
  bot: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    username: process.env.BOT_USERNAME || 'myshop_bot',
  },
  shop: {
    name: process.env.SHOP_NAME || '🛍️ MyShop',
    currency: process.env.CURRENCY || 'USD',
    currencySymbol: process.env.CURRENCY_SYMBOL || '$',
    supportUsername: process.env.SUPPORT_USERNAME || '',
    about: process.env.ABOUT_TEXT || 'Welcome to our Telegram shop! Browse our products and place your order directly here.',
  },
  database: {
    file: process.env.DB_FILE || './database.json',
    backupEnabled: process.env.BACKUP_ENABLED === 'true',
    backupInterval: parseInt(process.env.BACKUP_INTERVAL || '3600000'),
  },
  admin: {
    userId: process.env.ADMIN_USER_ID || '7343892253',
  },
  env: {
    nodeEnv: process.env.NODE_ENV || 'production',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

if (!config.bot.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set');
  process.exit(1);
}

export default config;
