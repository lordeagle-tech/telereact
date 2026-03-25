import { db } from './database.js';
import { Logger } from './utils.js';
import { AdminHandler, OrderHandler } from './handlers.js';
import config from './config.js';

class CommandProcessor {
  static async processAdminCommand(bot, chatId, userId, text, parts) {
    const command = parts[0].toLowerCase();

    if (command === '/ban' && parts[1]) {
      const targetId = parts[1];
      AdminHandler.banUser(targetId)
        ? await bot.sendMessage(chatId, `✅ User ${targetId} has been banned.`)
        : await bot.sendMessage(chatId, `❌ Could not ban user ${targetId}.`);
      return;
    }

    if (command === '/unban' && parts[1]) {
      const targetId = parts[1];
      AdminHandler.unbanUser(targetId)
        ? await bot.sendMessage(chatId, `✅ User ${targetId} has been unbanned.`)
        : await bot.sendMessage(chatId, `❌ Could not unban user ${targetId}.`);
      return;
    }

    if (command === '/addadmin' && parts[1]) {
      AdminHandler.addAdmin(parts[1])
        ? await bot.sendMessage(chatId, `✅ User ${parts[1]} is now an admin.`)
        : await bot.sendMessage(chatId, `❌ Could not add admin.`);
      return;
    }

    if (command === '/removeadmin' && parts[1]) {
      AdminHandler.removeAdmin(parts[1])
        ? await bot.sendMessage(chatId, `✅ User ${parts[1]} removed from admins.`)
        : await bot.sendMessage(chatId, `❌ Could not remove admin.`);
      return;
    }

    if (command === '/stats') {
      const s = AdminHandler.getSystemStats();
      await bot.sendMessage(
        chatId,
        `📊 STORE STATISTICS\n\n👥 Users: ${s.totalUsers}\n📦 Products: ${s.totalProducts}\n📋 Total Orders: ${s.totalOrders}\n⏳ Pending: ${s.pendingOrders}\n✅ Confirmed: ${s.confirmedOrders}\n🚚 Delivered: ${s.deliveredOrders}\n💰 Revenue: ${config.shop.currencySymbol}${s.totalRevenue.toFixed(2)}\n👮 Admins: ${s.totalAdmins}\n🚫 Banned: ${s.bannedUsers}`
      );
      return;
    }

    if (command === '/broadcast' && parts.length > 1) {
      const message = parts.slice(1).join(' ');
      const users = Object.values(db.getAllUsers());
      let sent = 0;
      for (const user of users) {
        try {
          if (!db.isBanned(user.id)) {
            await bot.sendMessage(user.chatId, `📢 ANNOUNCEMENT\n\n${message}`);
            sent++;
          }
        } catch (e) {
          Logger.warn(`Could not broadcast to ${user.username}`);
        }
      }
      await bot.sendMessage(chatId, `✅ Broadcast sent to ${sent} users.`);
      return;
    }

    if (command === '/help') {
      await bot.sendMessage(
        chatId,
        `⚙️ ADMIN COMMANDS\n\n/ban <userId> — Ban a user\n/unban <userId> — Unban a user\n/addadmin <userId> — Add admin\n/removeadmin <userId> — Remove admin\n/stats — Store statistics\n/broadcast <message> — Send to all users\n/help — This message\n\nUse /start to open the admin panel.`
      );
      return;
    }
  }

  static async processUserCommand(bot, chatId, userId, text, parts) {
    const command = parts[0].toLowerCase();

    if (command === '/orders') {
      const orders = OrderHandler.getUserOrders(userId);
      if (orders.length === 0) {
        await bot.sendMessage(chatId, `📦 You have no orders yet.\n\nUse /start to browse the shop! 🛍️`);
        return;
      }
      const statusEmoji = { pending: '⏳', confirmed: '✅', delivered: '🚚', cancelled: '❌' };
      let msg = `📦 MY ORDERS (${orders.length})\n\n`;
      orders.slice(0, 10).forEach((o, i) => {
        msg += `${i + 1}. ${o.productName} — ${config.shop.currencySymbol}${Number(o.total).toFixed(2)} ${statusEmoji[o.status] || ''}\n`;
      });
      await bot.sendMessage(chatId, msg);
      return;
    }

    if (command === '/help') {
      await bot.sendMessage(
        chatId,
        `ℹ️ HELP\n\n/start — Open the shop menu\n/orders — View my order history\n/help — This message`
      );
      return;
    }
  }
}

export default CommandProcessor;
