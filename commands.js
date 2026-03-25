import { db } from './database.js';
import { Logger, MessageFormatter, APIHelper } from './utils.js';
import { UserHandler, AdminHandler, ChannelHandler } from './handlers.js';
import config from './config.js';

export class CommandProcessor {
  static async processUserCommand(bot, chatId, userId, text, args) {
    const command = args[0];

    switch (command) {
      case '/daily':
        return await this.dailyCommand(bot, chatId, userId);

      case '/view':
        return await this.viewCommand(bot, chatId, userId, args[1]);

      case '/react':
        return await this.reactCommand(bot, chatId, userId, args[1]);

      case '/buyprem':
        return await this.buyPremiumCommand(bot, chatId, userId);

      case '/invite':
        return await this.inviteCommand(bot, chatId, userId);

      case '/stats':
        return await this.statsCommand(bot, chatId, userId);

      case '/help':
        return await this.helpCommand(bot, chatId, userId);

      default:
        return await bot.sendMessage(chatId, '❓ Unknown command. Type /help for assistance.');
    }
  }

  static async adminCommand(bot, chatId, userId, text, args) {
    if (!db.isAdmin(userId)) {
      await bot.sendMessage(chatId, '❌ Not authorized!');
      return;
    }

    const command = args[0];

    switch (command) {
      case '/addadmin':
        return await this.addAdminCommand(bot, chatId, args[1]);

      case '/list':
        return await this.listCommand(bot, chatId);

      case '/broadcast':
        return await this.broadcastCommand(bot, chatId, text);

      case '/edit':
        return await this.editBankCommand(bot, chatId);

      case '/ban':
        return await this.banCommand(bot, chatId, args[1]);

      case '/unban':
        return await this.unbanCommand(bot, chatId, args[1]);

      case '/addchn':
        return await this.addChannelCommand(bot, chatId, args[1]);

      case '/gencode':
        return await this.gencodeCommand(bot, chatId, args[1], args[2]);

      case '/aigen':
        return await this.aigenCommand(bot, chatId, text);

      case '/stats_sys':
        return await this.systemStatsCommand(bot, chatId);

      default:
        return await bot.sendMessage(chatId, '❓ Unknown admin command.');
    }
  }

  // User Commands
  static async dailyCommand(bot, chatId, userId) {
    const user = db.getUser(userId);
    if (db.isBanned(userId)) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned!');
      return;
    }

    const result = UserHandler.claimDaily(userId);
    await bot.sendMessage(chatId, result.message);
  }

  static async viewCommand(bot, chatId, userId, amount) {
    const user = db.getUser(userId);
    if (db.isBanned(userId)) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned!');
      return;
    }

    if (!amount) {
      const maxViews = user.isPremium
        ? config.features.premiumViewsLimit
        : config.features.freeViewsLimit;
      await bot.sendMessage(
        chatId,
        `👁️ BOOST VIEWS\n\nUsage: /view <amount>\nMax today: ${maxViews - user.viewsUsedToday}\n\nExample: /view 50`
      );
      return;
    }

    const result = UserHandler.useViews(userId, parseInt(amount));
    if (!result.success) {
      await bot.sendMessage(chatId, result.message);
      return;
    }

    // Call API to boost views
    const apiResult = await APIHelper.boostViews(parseInt(amount), chatId);
    if (apiResult.success) {
      await bot.sendMessage(chatId, result.message);
    } else {
      await bot.sendMessage(chatId, `❌ Error: ${apiResult.error}`);
    }
  }

  static async reactCommand(bot, chatId, userId, amount) {
    const user = db.getUser(userId);
    if (db.isBanned(userId)) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned!');
      return;
    }

    if (!amount) {
      const maxReactions = user.isPremium
        ? config.features.premiumReactionsLimit
        : config.features.freeReactionsLimit;
      await bot.sendMessage(
        chatId,
        `❤️ BOOST REACTIONS\n\nUsage: /react <amount>\nMax today: ${maxReactions - user.reactionsUsedToday}\n\nExample: /react 30`
      );
      return;
    }

    const result = UserHandler.useReactions(userId, parseInt(amount));
    if (!result.success) {
      await bot.sendMessage(chatId, result.message);
      return;
    }

    // Call API to boost reactions
    const apiResult = await APIHelper.boostReactions(parseInt(amount), chatId);
    if (apiResult.success) {
      await bot.sendMessage(chatId, result.message);
    } else {
      await bot.sendMessage(chatId, `❌ Error: ${apiResult.error}`);
    }
  }

  static async buyPremiumCommand(bot, chatId, userId) {
    const user = db.getUser(userId);

    const keyboard = {
      inline_keyboard: [
        [{ text: '💰 Buy with Points (100)', callback_data: 'buy_points' }],
        [{ text: '🏦 Bank Transfer', callback_data: 'bank_transfer' }],
        [{ text: '❌ Cancel', callback_data: 'cancel_buyprem' }],
      ],
    };

    await bot.sendMessage(
      chatId,
      `💳 BUY PREMIUM

⭐ Premium Benefits:
  • ${config.features.premiumViewsLimit} Views/Day (vs ${config.features.freeViewsLimit})
  • ${config.features.premiumReactionsLimit} Reactions/Day (vs ${config.features.freeReactionsLimit})
  • Priority Support
  • Boost 10x Points earning

💰 Price: ${config.features.premiumCost} Points

Your points: ${user.points}`,
      { reply_markup: keyboard }
    );
  }

  static async inviteCommand(bot, chatId, userId) {
    const user = db.getUser(userId);
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📋 Copy Link',
            url: `https://t.me/${config.bot.username}?start=ref_${user.referralCode}`,
          },
        ],
      ],
    };

    await bot.sendMessage(
      chatId,
      MessageFormatter.referralMessage(user),
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      }
    );
  }

  static async statsCommand(bot, chatId, userId) {
    const user = db.getUser(userId);
    await bot.sendMessage(chatId, MessageFormatter.statsMessage(user));
  }

  static async helpCommand(bot, chatId, userId) {
    const isAdmin = db.isAdmin(userId);

    let helpText = `📚 HELP & COMMANDS

🎮 USER COMMANDS:
/start - Start the bot
/daily - Claim 2 points daily
/view <amount> - Boost post views
/react <amount> - Boost reactions
/buyprem - Buy premium membership
/invite - Get referral link
/stats - View your statistics
/help - Show this help message

`;

    if (isAdmin) {
      helpText += `⚙️ ADMIN COMMANDS:
/addadmin <id> - Add new admin
/list - List all users
/broadcast <msg> - Send message to all users
/edit - Edit bank details
/ban @username - Ban a user
/unban @username - Unban a user
/addchn @channel - Add channel to verify
/gencode <points> <uses> - Generate redeem code
/aigen <prompt> - AI code generation
/stats_sys - System statistics`;
    }

    await bot.sendMessage(chatId, helpText);
  }

  // Admin Commands
  static async addAdminCommand(bot, chatId, userId) {
    if (!userId || isNaN(userId)) {
      await bot.sendMessage(chatId, '❌ Usage: /addadmin <user_id>');
      return;
    }

    const success = AdminHandler.addAdmin(parseInt(userId));
    const message = success
      ? `✅ Admin added successfully!\n\nNew Admin ID: ${userId}`
      : '⚠️ This user is already an admin!';

    await bot.sendMessage(chatId, message);
  }

  static async listCommand(bot, chatId) {
    const users = AdminHandler.getListOfUsers();
    let userList = `📋 USERS (${Object.keys(db.getAllUsers()).length})\n\n`;

    users.forEach((user, index) => {
      userList += `${index + 1}. @${user.username}\n`;
      userList += `   ID: ${user.chatId}\n`;
      userList += `   Points: ${user.points}\n`;
      userList += `   Referrals: ${user.referrals}\n`;
      userList += `   Status: ${user.isPremium ? 'PREMIUM' : 'FREE'}\n\n`;
    });

    if (Object.keys(db.getAllUsers()).length > 50) {
      userList += `\n... and ${Object.keys(db.getAllUsers()).length - 50} more users`;
    }

    await bot.sendMessage(chatId, userList);
  }

  static async broadcastCommand(bot, chatId, text) {
    const message = text.replace(/\/broadcast\s+/i, '').trim();

    if (!message) {
      await bot.sendMessage(chatId, '❌ Please provide a message to broadcast.');
      return;
    }

    const count = AdminHandler.broadcastMessage(message);
    const users = db.getAllUsers();

    let sent = 0;
    Object.values(users).forEach(user => {
      if (!db.isBanned(user.id)) {
        bot.sendMessage(user.chatId, `📢 ${message}`).catch(err => {
          Logger.warn(`Failed to send message to ${user.username}`);
        });
        sent++;
      }
    });

    await bot.sendMessage(chatId, `✅ Message sent to ${sent} users!`);
  }

  static async editBankCommand(bot, chatId) {
    const bankDetails = db.getBankDetails();
    await bot.sendMessage(
      chatId,
      `🏦 EDIT BANK DETAILS

Current Details:
Account Name: ${bankDetails.accountName || 'Not set'}
Account Number: ${bankDetails.accountNumber || 'Not set'}
Bank Name: ${bankDetails.bankName || 'Not set'}

Send details in this format:
\`Account Name | Account Number | Bank Name\`

Example:
\`John Doe | 1234567890 | State Bank\``,
      { parse_mode: 'Markdown' }
    );
  }

  static async banCommand(bot, chatId, username) {
    if (!username) {
      await bot.sendMessage(chatId, '❌ Usage: /ban @username');
      return;
    }

    const cleanUsername = username.replace('@', '');
    const users = db.getAllUsers();
    const user = Object.values(users).find(u => u.username === cleanUsername);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found!');
      return;
    }

    const success = AdminHandler.banUser(user.id);
    const message = success
      ? `✅ User @${cleanUsername} has been banned!`
      : '⚠️ User is already banned!';

    await bot.sendMessage(chatId, message);
  }

  static async unbanCommand(bot, chatId, username) {
    if (!username) {
      await bot.sendMessage(chatId, '❌ Usage: /unban @username');
      return;
    }

    const cleanUsername = username.replace('@', '');
    const users = db.getAllUsers();
    const user = Object.values(users).find(u => u.username === cleanUsername);

    if (!user) {
      await bot.sendMessage(chatId, '❌ User not found!');
      return;
    }

    const success = AdminHandler.unbanUser(user.id);
    const message = success
      ? `✅ User @${cleanUsername} has been unbanned!`
      : '❌ User not found or not banned!';

    await bot.sendMessage(chatId, message);
  }

  static async addChannelCommand(bot, chatId, channelName) {
    if (!channelName || !channelName.startsWith('@')) {
      await bot.sendMessage(chatId, '❌ Usage: /addchn @channelname');
      return;
    }

    const success = AdminHandler.addChannel(channelName);
    const message = success
      ? `✅ Channel ${channelName} added to verification list!`
      : '❌ Invalid channel or already exists!';

    await bot.sendMessage(chatId, message);
  }

  static async gencodeCommand(bot, chatId, points, uses) {
    if (!points || !uses || isNaN(points) || isNaN(uses)) {
      await bot.sendMessage(chatId, '❌ Usage: /gencode <points> <number_of_uses>\n\nExample: /gencode 10 50');
      return;
    }

    const code = AdminHandler.generateRedeemCode(parseInt(points), parseInt(uses));

    if (!code) {
      await bot.sendMessage(chatId, '❌ Invalid points or uses amount!');
      return;
    }

    await bot.sendMessage(
      chatId,
      `✅ Code generated!\n\nCode: \`${code}\`\nPoints: ${points}\nUses: ${uses}`,
      { parse_mode: 'Markdown' }
    );
  }

  static async aigenCommand(bot, chatId, text) {
    const prompt = text.replace(/\/aigen\s+/i, '').trim();

    if (!prompt) {
      await bot.sendMessage(chatId, '❌ Usage: /aigen <your_prompt>');
      return;
    }

    await bot.sendMessage(chatId, '⏳ Generating code... Please wait...');

    const result = await APIHelper.generateCode(prompt);

    if (!result.success) {
      await bot.sendMessage(chatId, `❌ Error: ${result.error}`);
      return;
    }

    try {
      await bot.sendDocument(chatId, Buffer.from(result.code), {
        filename: `generated_${Date.now()}.js`,
        caption: '✅ AI Generated Code',
      });
    } catch (error) {
      await bot.sendMessage(chatId, `\`\`\`javascript\n${result.code.substring(0, 4000)}\n\`\`\``, {
        parse_mode: 'Markdown',
      });
    }
  }

  static async systemStatsCommand(bot, chatId) {
    const stats = AdminHandler.getSystemStats();

    const statsText = `📊 SYSTEM STATISTICS

👥 Total Users: ${stats.totalUsers}
⭐ Premium Users: ${stats.premiumUsers}
✅ Verified Users: ${stats.verifiedUsers}
🚫 Banned Users: ${stats.bannedUsers}
👮 Total Admins: ${stats.totalAdmins}
💰 Total Points in System: ${stats.totalPoints}`;

    await bot.sendMessage(chatId, statsText);
  }
}

export default CommandProcessor;