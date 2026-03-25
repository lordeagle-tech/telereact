import axios from 'axios';
import config from './config.js';

export class Logger {
  static info(message) {
    console.log(`ℹ️  [${new Date().toISOString()}] ${message}`);
  }

  static success(message) {
    console.log(`✅ [${new Date().toISOString()}] ${message}`);
  }

  static warn(message) {
    console.warn(`⚠️  [${new Date().toISOString()}] ${message}`);
  }

  static error(message) {
    console.error(`❌ [${new Date().toISOString()}] ${message}`);
  }
}

export class APIHelper {
  static async boostViews(amount, channelId) {
    try {
      const response = await axios.post(config.api.bitrahq.url, {
        api_key: config.api.bitrahq.key,
        action: 'boost_views',
        amount,
        channel_id: channelId,
      });
      return { success: true, data: response.data };
    } catch (error) {
      Logger.error(`API boost views error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  static async boostReactions(amount, channelId) {
    try {
      const response = await axios.post(config.api.bitrahq.url, {
        api_key: config.api.bitrahq.key,
        action: 'boost_reactions',
        amount,
        channel_id: channelId,
      });
      return { success: true, data: response.data };
    } catch (error) {
      Logger.error(`API boost reactions error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  static async generateCode(prompt) {
    try {
      const response = await axios.get(config.api.aiApi, {
        params: { prompt },
      });
      return { success: true, code: response.data.message || response.data };
    } catch (error) {
      Logger.error(`AI API error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

export class MessageFormatter {
  static mainMenu(user) {
    return `🩸⃟ 𝕄Ｅ𝓷ⓐ🌹 MAIN MENU

👤 User: @${user.username}
💰 Points: ${user.points}
👥 Referrals: ${user.referrals}
🌟 Status: ${user.isPremium ? 'PREMIUM ⭐' : 'FREE'}

Select an option:`;
  }

  static adminMenu() {
    return `⚙️ ADMIN PANEL

Select an option:`;
  }

  static statsMessage(user) {
    return `📊 YOUR STATISTICS

👤 Username: @${user.username}
💰 Total Points: ${user.points}
👥 Total Referrals: ${user.referrals}
🌟 Status: ${user.isPremium ? 'PREMIUM ⭐' : 'FREE'}
📅 Member Since: ${new Date(user.joinedAt).toLocaleDateString()}

📈 Today:
  👁️ Views Used: ${user.viewsUsedToday}
  ❤️ Reactions Used: ${user.reactionsUsedToday}
  📥 Daily Claims: ${user.dailyClaimsToday}`;
  }

  static welcomeBanner(status = 'UNVERIFIED') {
    return `┏━━[ WELCOME TO 🩸⃟ 𝕄Ｅ𝓷ⓐ🌹OFC BOT¹ ]━
┃ ɴᴀᴍᴇ ʙᴏᴛ : 🩸⃟ 𝕄Ｅ𝓷ⓐ🌹
┃ ᴠᴇʀ𝘴ɪᴏɴ : v2.0
┃ ᴅᴇᴠᴇʟᴏᴘᴇʀ : @DENKI_CRASHER
┃ ʀᴜɴᴛɪᴍᴇ : NODE.JS
┃ sᴛᴀᴛᴜs : ${status}
┗━━━━━━━━━━━━━━━━━━━━━━

© 🩸⃟ 𝕄Ｅ𝓷ⓐ🌹
━━━━━━━━ ✇➣`;
  }

  static referralMessage(user) {
    const referralLink = `https://t.me/${config.bot.username}?start=ref_${user.referralCode}`;
    return `👥 INVITE FRIENDS

🔗 Your Referral Link:
\`${referralLink}\`

👥 Referrals: ${user.referrals}
💰 Points from referrals: ${user.referrals * config.features.pointsPerReferral}

✨ Earn ${config.features.pointsPerReferral} point per successful referral!`;
  }
}

export class ValidationHelper {
  static isValidUsername(username) {
    return /^[a-zA-Z0-9_]{5,32}$/.test(username);
  }

  static isValidChannelName(name) {
    return /^@[a-zA-Z0-9_]{5,32}$/.test(name);
  }

  static isValidAmount(amount, max) {
    const num = parseInt(amount);
    return !isNaN(num) && num > 0 && num <= max;
  }

  static isValidBankDetails(accountName, accountNumber, bankName) {
    return (
      accountName &&
      accountName.trim().length > 0 &&
      accountNumber &&
      accountNumber.trim().length > 0 &&
      bankName &&
      bankName.trim().length > 0
    );
  }
}

export class TimeHelper {
  static getTodayString() {
    return new Date().toDateString();
  }

  static isNewDay(lastDate) {
    return lastDate !== this.getTodayString();
  }

  static formatDate(date) {
    return new Date(date).toLocaleDateString();
  }

  static formatTime(date) {
    return new Date(date).toLocaleTimeString();
  }
}

export default {
  Logger,
  APIHelper,
  MessageFormatter,
  ValidationHelper,
  TimeHelper,
};