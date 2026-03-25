import { db } from './database.js';
import { Logger, MessageFormatter, TimeHelper, ValidationHelper } from './utils.js';
import config from './config.js';

export class ChannelHandler {
  static async verifyChannelMembership(bot, userId, channels) {
    try {
      for (let channel of channels) {
        const member = await bot.getChatMember(channel, userId);
        if (!['member', 'creator', 'administrator'].includes(member.status)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      Logger.error(`Channel verification error: ${error.message}`);
      return false;
    }
  }

  static async getChannelMembers(bot, channelName) {
    try {
      const chat = await bot.getChat(channelName);
      return chat.members_count || 0;
    } catch (error) {
      Logger.error(`Error getting channel members: ${error.message}`);
      return 0;
    }
  }
}

export class UserHandler {
  static initializeUser(userId, username, chatId) {
    let user = db.getUser(userId);
    user.username = username || 'Unknown';
    user.chatId = chatId;
    return db.updateUser(userId, user);
  }

  static addPoints(userId, points, reason = 'manual') {
    const user = db.getUser(userId);
    user.points += points;
    Logger.info(`Added ${points} points to ${user.username} (${reason})`);
    return db.updateUser(userId, user);
  }

  static deductPoints(userId, points, reason = 'manual') {
    const user = db.getUser(userId);
    if (user.points >= points) {
      user.points -= points;
      Logger.info(`Deducted ${points} points from ${user.username} (${reason})`);
      return db.updateUser(userId, user);
    }
    return null;
  }

  static claimDaily(userId) {
    const user = db.getUser(userId);
    const today = TimeHelper.getTodayString();

    if (user.lastDailyClaim === today) {
      return { success: false, message: '⏰ You can only claim once per day!' };
    }

    user.points += config.features.dailyPoints;
    user.lastDailyClaim = today;
    user.dailyClaimsToday += 1;
    db.updateUser(userId, user);

    return {
      success: true,
      message: `✅ Daily claim successful!\n\n+${config.features.dailyPoints} Points\nTotal Points: ${user.points}`,
      points: user.points,
    };
  }

  static useViews(userId, amount) {
    const user = db.getUser(userId);
    const maxViews = user.isPremium
      ? config.features.premiumViewsLimit
      : config.features.freeViewsLimit;
    const remaining = maxViews - user.viewsUsedToday;

    if (!ValidationHelper.isValidAmount(amount, maxViews)) {
      return {
        success: false,
        message: `❌ Invalid amount!\n\nMax views today: ${remaining}`,
      };
    }

    if (user.viewsUsedToday + amount > maxViews) {
      return {
        success: false,
        message: `❌ Exceeds daily limit!\n\nRemaining: ${remaining}`,
      };
    }

    user.viewsUsedToday += amount;
    db.updateUser(userId, user);

    return {
      success: true,
      message: `✅ View boost successful!\n\n👁️ Views added: ${amount}\nRemaining today: ${maxViews - user.viewsUsedToday}`,
    };
  }

  static useReactions(userId, amount) {
    const user = db.getUser(userId);
    const maxReactions = user.isPremium
      ? config.features.premiumReactionsLimit
      : config.features.freeReactionsLimit;
    const remaining = maxReactions - user.reactionsUsedToday;

    if (!ValidationHelper.isValidAmount(amount, maxReactions)) {
      return {
        success: false,
        message: `❌ Invalid amount!\n\nMax reactions today: ${remaining}`,
      };
    }

    if (user.reactionsUsedToday + amount > maxReactions) {
      return {
        success: false,
        message: `❌ Exceeds daily limit!\n\nRemaining: ${remaining}`,
      };
    }

    user.reactionsUsedToday += amount;
    db.updateUser(userId, user);

    return {
      success: true,
      message: `✅ Reaction boost successful!\n\n❤️ Reactions added: ${amount}\nRemaining today: ${maxReactions - user.reactionsUsedToday}`,
    };
  }

  static buyPremium(userId) {
    const user = db.getUser(userId);

    if (user.points < config.features.premiumCost) {
      return {
        success: false,
        message: `❌ Not enough points!\n\nNeed: ${config.features.premiumCost}\nYou have: ${user.points}`,
      };
    }

    user.points -= config.features.premiumCost;
    user.isPremium = true;
    db.updateUser(userId, user);

    return {
      success: true,
      message: `✅ PREMIUM ACTIVATED\n\n⭐ Enjoy your premium benefits!\n\nRemaining Points: ${user.points}`,
    };
  }

  static addReferral(referrerId, referralCode) {
    const db_obj = db.getDB();
    const referrer = db.getUser(referrerId);

    if (referrer) {
      referrer.referrals += 1;
      referrer.points += config.features.pointsPerReferral;
      db.updateUser(referrerId, referrer);
      Logger.info(
        `Referral added: ${referrer.username} now has ${referrer.referrals} referrals`
      );
      return true;
    }
    return false;
  }
}

export class AdminHandler {
  static addAdmin(userId) {
    if (db.addAdmin(userId)) {
      Logger.success(`Admin added: ${userId}`);
      return true;
    }
    return false;
  }

  static removeAdmin(userId) {
    if (db.removeAdmin(userId)) {
      Logger.success(`Admin removed: ${userId}`);
      return true;
    }
    return false;
  }

  static banUser(userId) {
    if (db.banUser(userId)) {
      Logger.success(`User banned: ${userId}`);
      return true;
    }
    return false;
  }

  static unbanUser(userId) {
    if (db.unbanUser(userId)) {
      Logger.success(`User unbanned: ${userId}`);
      return true;
    }
    return false;
  }

  static generateRedeemCode(points, uses) {
    if (points <= 0 || uses <= 0) {
      return null;
    }
    const code = db.generateRedeemCode(points, uses);
    Logger.success(`Redeem code generated: ${code} (${points} points, ${uses} uses)`);
    return code;
  }

  static addChannel(channelName) {
    if (!ValidationHelper.isValidChannelName(channelName)) {
      return false;
    }
    if (db.addChannel(channelName)) {
      Logger.success(`Channel added: ${channelName}`);
      return true;
    }
    return false;
  }

  static updateBankDetails(accountName, accountNumber, bankName) {
    if (!ValidationHelper.isValidBankDetails(accountName, accountNumber, bankName)) {
      return false;
    }
    db.updateBankDetails({ accountName, accountNumber, bankName });
    Logger.success(`Bank details updated`);
    return true;
  }

  static getSystemStats() {
    return db.getStats();
  }

  static getListOfUsers(limit = 50) {
    const users = db.getAllUsers();
    const userList = Object.values(users).slice(0, limit);
    return userList;
  }

  static broadcastMessage(message, excludeUserId = null) {
    const users = db.getAllUsers();
    let count = 0;

    Object.values(users).forEach(user => {
      if (excludeUserId !== user.id && !db.isBanned(user.id)) {
        count++;
      }
    });

    Logger.info(`Broadcast message queued for ${count} users`);
    return count;
  }
}

export default {
  ChannelHandler,
  UserHandler,
  AdminHandler,
};