import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import { db } from './database.js';
import { Logger, MessageFormatter, TimeHelper } from './utils.js';
import { UserHandler, AdminHandler, ChannelHandler } from './handlers.js';
import CommandProcessor from './commands.js';
import config from './config.js';

const bot = new TelegramBot(config.bot.token, { polling: true });

// Welcome message
console.log(MessageFormatter.welcomeBanner('STARTING...'));
Logger.success('Telegram Bot v2.0 initialized');
Logger.info(`Bot Username: ${config.bot.username.startsWith('@') ? config.bot.username : '@' + config.bot.username}`);
Logger.info(`Channels to verify: ${config.channels.list.join(', ')}`);

// Auto reset daily limits periodically
setInterval(() => {
  db.resetDailyLimits();
  Logger.info('Daily limits reset');
}, 60 * 60 * 1000); // Every hour

// Handle /start command
bot.onText(/\/start(?:\s+(.+))?/, async msg => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `User${userId}`;
  const referralCode = msg.text.split(' ')[1] || null;

  // Check if user is banned
  if (db.isBanned(userId)) {
    await bot.sendMessage(chatId, '🚫 Your account has been banned from this bot!');
    Logger.warn(`Banned user attempted to access: ${username}`);
    return;
  }

  // Initialize user
  UserHandler.initializeUser(userId, username, chatId);
  const user = db.getUser(userId);

  // Auto-verify user
  if (!user.verified) {
    user.verified = true;
    db.updateUser(userId, user);
  }

  // Handle referral
  if (referralCode && referralCode.startsWith('ref_')) {
    const code = referralCode.substring(4);
    const users = db.getAllUsers();
    const referrer = Object.values(users).find(u => u.referralCode === code);

    if (referrer && referrer.id !== userId) {
      UserHandler.addReferral(referrer.id, code);
      Logger.info(`New referral: ${username} referred by ${referrer.username}`);
    }
  }

  await showMainMenu(chatId, user);
});

// Callback query handler
bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const user = db.getUser(userId);

  // Check if user is banned
  if (db.isBanned(userId)) {
    await bot.answerCallbackQuery(query.id, '🚫 Your account has been banned!', true);
    return;
  }

  try {
    // Main menu
    if (query.data === 'show_menu') {
      await showMainMenu(chatId, user);
      return;
    }

    // Buy with Points
    if (query.data === 'buy_points') {
      const result = UserHandler.buyPremium(userId);
      if (result.success) {
        await bot.answerCallbackQuery(query.id, '✅ Premium activated!');
        await bot.editMessageText(result.message, {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'show_menu' }]],
          },
        });
      } else {
        await bot.answerCallbackQuery(query.id, result.message, true);
      }
      return;
    }

    // Bank Transfer
    if (query.data === 'bank_transfer') {
      const bankDetails = db.getBankDetails();
      let bankText = `🏦 BANK TRANSFER\n\nBank Details:\n`;

      if (bankDetails.accountName)
        bankText += `Account Name: ${bankDetails.accountName}\n`;
      if (bankDetails.accountNumber)
        bankText += `Account Number: ${bankDetails.accountNumber}\n`;
      if (bankDetails.bankName) bankText += `Bank Name: ${bankDetails.bankName}\n`;

      bankText += `\n📝 Instructions:\n1. Transfer the amount\n2. Reply with: AMOUNT\n3. Send screenshot\n4. Wait for admin verification`;

      await bot.editMessageText(bankText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'buyprem_menu' }]],
        },
      });
      return;
    }

    // Buy Premium Menu
    if (query.data === 'buyprem_menu') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '💰 Buy with Points (100)', callback_data: 'buy_points' }],
          [{ text: '🏦 Bank Transfer', callback_data: 'bank_transfer' }],
          [{ text: '⬅️ Back', callback_data: 'show_menu' }],
        ],
      };

      await bot.editMessageText(
        `💳 BUY PREMIUM

⭐ Premium Benefits:
  • ${config.features.premiumViewsLimit} Views/Day
  • ${config.features.premiumReactionsLimit} Reactions/Day
  • Priority Support
  • 10x Points Multiplier

💰 Price: ${config.features.premiumCost} Points
Your Points: ${user.points}`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          reply_markup: keyboard,
        }
      );
      return;
    }

    // Admin Menu
    if (query.data === 'admin_menu') {
      if (!db.isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
        return;
      }

      await bot.editMessageText(MessageFormatter.adminMenu(), {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 List Users', callback_data: 'admin_list' }],
            [{ text: '⭐ System Stats', callback_data: 'admin_stats' }],
            [{ text: '⬅️ Back', callback_data: 'show_menu' }],
          ],
        },
      });
      return;
    }

    // Admin List Users
    if (query.data === 'admin_list') {
      if (!db.isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
        return;
      }

      const users = AdminHandler.getListOfUsers(20);
      let userList = `📋 USERS (${Object.keys(db.getAllUsers()).length})\n\n`;

      users.forEach((u, i) => {
        userList += `${i + 1}. @${u.username} | Points: ${u.points}\n`;
      });

      await bot.editMessageText(userList, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]],
        },
      });
      return;
    }

    // Admin Stats
    if (query.data === 'admin_stats') {
      if (!db.isAdmin(userId)) {
        await bot.answerCallbackQuery(query.id, '❌ Not authorized!', true);
        return;
      }

      const stats = AdminHandler.getSystemStats();
      const statsText = `📊 SYSTEM STATISTICS\n\n👥 Total Users: ${stats.totalUsers}\n⭐ Premium Users: ${stats.premiumUsers}\n✅ Verified Users: ${stats.verifiedUsers}\n🚫 Banned Users: ${stats.bannedUsers}\n👮 Total Admins: ${stats.totalAdmins}\n💰 Total Points: ${stats.totalPoints}`;

      await bot.editMessageText(statsText, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]],
        },
      });
      return;
    }

    // Close menu
    if (query.data === 'close_menu') {
      await bot.deleteMessage(chatId, query.message.message_id);
      return;
    }
  } catch (error) {
    Logger.error(`Callback query error: ${error.message}`);
    await bot.answerCallbackQuery(query.id, '❌ An error occurred', true);
  }
});

// Text message handler
bot.on('message', async msg => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || '';
  const username = msg.from.username || `User${userId}`;

  // Check if user is banned
  if (db.isBanned(userId)) {
    Logger.warn(`Banned user attempted action: ${username}`);
    return;
  }

  // Initialize user if needed
  UserHandler.initializeUser(userId, username, chatId);

  // Check if it's a command
  if (text.startsWith('/')) {
    const parts = text.split(' ');
    const command = parts[0];

    // Admin commands
    if (db.isAdmin(userId)) {
      await CommandProcessor.adminCommand(bot, chatId, userId, text, parts);
      return;
    }

    // User commands
    if (['/daily', '/view', '/react', '/buyprem', '/invite', '/stats', '/help'].includes(command)) {
      await CommandProcessor.processUserCommand(bot, chatId, userId, text, parts);
      return;
    }

    await bot.sendMessage(chatId, '❓ Unknown command. Type /help for assistance.');
    return;
  }

  // Handle bank transfer details (admin)
  if (db.isAdmin(userId) && text.includes('|')) {
    const parts = text.split('|').map(p => p.trim());
    if (parts.length === 3) {
      const success = AdminHandler.updateBankDetails(parts[0], parts[1], parts[2]);
      if (success) {
        await bot.sendMessage(chatId, '✅ Bank details updated successfully!');
      } else {
        await bot.sendMessage(chatId, '❌ Invalid bank details format!');
      }
      return;
    }
  }

  // Handle redeem code
  const code = text.toUpperCase().trim();
  if (code.length === 6 && /^[A-Z0-9]{6}$/.test(code)) {
    const result = db.redeemCode(code, userId);
    if (result.success) {
      await bot.sendMessage(chatId, `✅ ${result.message}\n\nTotal Points: ${db.getUser(userId).points}`);
      Logger.info(`Code redeemed by ${username}: +${result.points} points`);
    } else {
      await bot.sendMessage(chatId, `❌ ${result.message}`);
    }
    return;
  }

  // Default response
  await bot.sendMessage(
    chatId,
    '👋 I didn\'t understand that. Type /help for available commands or use the menu buttons.'
  );
});

// Show main menu
async function showMainMenu(chatId, user) {
  const isAdmin = db.isAdmin(user.id);

  let buttons = [
    [{ text: '💳 Buy Premium', callback_data: 'buyprem_menu' }],
    [
      { text: '👁️ Views', callback_data: 'view_info' },
      { text: '❤️ Reactions', callback_data: 'react_info' },
    ],
    [
      { text: '📅 Daily', callback_data: 'daily_info' },
      { text: '👥 Invite', callback_data: 'invite_info' },
    ],
    [{ text: '📊 Stats', callback_data: 'stats_info' }],
  ];

  if (isAdmin) {
    buttons.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_menu' }]);
  }

  buttons.push([{ text: '❌ Close', callback_data: 'close_menu' }]);

  await bot.sendMessage(chatId, MessageFormatter.mainMenu(user), {
    reply_markup: { inline_keyboard: buttons },
  });
}

// Handle errors
process.on('unhandledRejection', error => {
  Logger.error(`Unhandled Rejection: ${error.message}`);
});

bot.on('polling_error', error => {
  Logger.error(`Polling error: ${error.message}`);
});

process.on('SIGINT', () => {
  Logger.info('Bot shutting down...');
  bot.stopPolling();
  process.exit(0);
});

// Start message
Logger.success('🤖 Bot is running and listening for messages...');
Logger.info(`Ready to serve with v2.0`);