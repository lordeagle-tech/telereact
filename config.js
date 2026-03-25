import dotenv from 'dotenv';

dotenv.config();

export const config = {
  bot: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    username: process.env.BOT_USERNAME || 'menaxtech_bot',
  },
  api: {
    bitrahq: {
      key: process.env.BITRAHQ_API_KEY || 'ef209f45e59848126a807ef654d36e9c',
      url: process.env.BITRAHQ_API_URL || 'https://bitrahq.com/api/v1/services.php',
    },
    aiApi: process.env.AI_API_URL || 'https://api-rebix.vercel.app/api/copilot',
  },
  channels: {
    list: [
      process.env.CHANNEL_1 || '@DENKI_CRASHER',
      process.env.CHANNEL_2 || '@MENA_TECH2',
    ],
  },
  database: {
    file: process.env.DB_FILE || './database.json',
    backupEnabled: process.env.BACKUP_ENABLED === 'true',
    backupInterval: parseInt(process.env.BACKUP_INTERVAL || '3600000'),
  },
  features: {
    dailyPoints: parseInt(process.env.DAILY_POINTS || '2'),
    freeViewsLimit: parseInt(process.env.FREE_VIEWS_LIMIT || '150'),
    premiumViewsLimit: parseInt(process.env.PREMIUM_VIEWS_LIMIT || '500'),
    freeReactionsLimit: parseInt(process.env.FREE_REACTIONS_LIMIT || '100'),
    premiumReactionsLimit: parseInt(process.env.PREMIUM_REACTIONS_LIMIT || '300'),
    premiumCost: parseInt(process.env.PREMIUM_COST || '100'),
    pointsPerReferral: parseInt(process.env.POINTS_PER_REFERRAL || '1'),
  },
  admin: {
    userId: process.env.ADMIN_USER_ID || '',
  },
  env: {
    nodeEnv: process.env.NODE_ENV || 'production',
    logLevel: process.env.LOG_LEVEL || 'info',
  },
};

// Validate critical configuration
if (!config.bot.token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

export default config;