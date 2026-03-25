import TelegramBot from 'node-telegram-bot-api';
import { db } from './database.js';
import { Logger, MessageFormatter } from './utils.js';
import { ProductHandler, OrderHandler, AdminHandler } from './handlers.js';
import CommandProcessor from './commands.js';
import config from './config.js';

const bot = new TelegramBot(config.bot.token, { polling: true });

// In-memory conversation state per user
const userState = new Map();

const CATEGORIES = {
  digital:      { name: '📚 Digital Products',  emoji: '📚' },
  services:     { name: '🛠️ Services',           emoji: '🛠️' },
  physical:     { name: '📦 Physical Goods',     emoji: '📦' },
  subscription: { name: '⭐ Subscriptions',       emoji: '⭐' },
};

const STATUS_EMOJI = { pending: '⏳', confirmed: '✅', delivered: '🚚', cancelled: '❌' };

Logger.success(`${config.shop.name} Bot initialized`);
Logger.info(
  `Bot Username: ${config.bot.username.startsWith('@') ? config.bot.username : '@' + config.bot.username}`
);

// ── Helpers ────────────────────────────────────────────────────────────────

function syncUser(userId, username, chatId) {
  db.updateUser(userId, { username, chatId, verified: true });
  return db.getUser(userId);
}

async function showMainMenu(chatId, username, userId) {
  const isAdmin = db.isAdmin(userId);
  const buttons = [
    [{ text: '🛍️ Browse Shop', callback_data: 'shop_menu' }, { text: 'ℹ️ About', callback_data: 'about' }],
    [{ text: '📦 My Orders', callback_data: 'my_orders' }, { text: '💬 Support', callback_data: 'support' }],
  ];
  if (isAdmin) buttons.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_menu' }]);
  await bot.sendMessage(chatId, MessageFormatter.mainMenu(username), {
    reply_markup: { inline_keyboard: buttons },
  });
}

async function editMainMenu(chatId, messageId, username, userId) {
  const isAdmin = db.isAdmin(userId);
  const buttons = [
    [{ text: '🛍️ Browse Shop', callback_data: 'shop_menu' }, { text: 'ℹ️ About', callback_data: 'about' }],
    [{ text: '📦 My Orders', callback_data: 'my_orders' }, { text: '💬 Support', callback_data: 'support' }],
  ];
  if (isAdmin) buttons.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_menu' }]);
  await bot.editMessageText(MessageFormatter.mainMenu(username), {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: buttons },
  });
}

// ── /start ─────────────────────────────────────────────────────────────────

bot.onText(/\/start/, async msg => {
  if (msg.chat.type !== 'private') return;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `User${userId}`;

  if (db.isBanned(userId)) {
    await bot.sendMessage(chatId, '🚫 Your account has been banned.');
    return;
  }

  syncUser(userId, username, chatId);
  userState.delete(userId);
  await showMainMenu(chatId, username, userId);
});

// ── Callback query handler ─────────────────────────────────────────────────

bot.on('callback_query', async query => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = query.from.id;
  const username = query.from.username || `User${userId}`;
  const data = query.data;

  if (db.isBanned(userId)) {
    await bot.answerCallbackQuery(query.id, '🚫 You are banned.', true);
    return;
  }

  await bot.answerCallbackQuery(query.id).catch(() => {});

  try {
    // ── Navigation ──────────────────────────────────────────────────────

    if (data === 'main_menu') {
      userState.delete(userId);
      await editMainMenu(chatId, messageId, username, userId);
      return;
    }

    if (data === 'shop_menu') {
      const buttons = Object.entries(CATEGORIES).map(([key, cat]) => [
        { text: cat.name, callback_data: `cat_${key}` },
      ]);
      buttons.push([{ text: '⬅️ Back', callback_data: 'main_menu' }]);
      await bot.editMessageText(MessageFormatter.categoryMenu(), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data === 'about') {
      const support = config.shop.supportUsername
        ? `\n\n💬 Support: ${config.shop.supportUsername}`
        : '';
      await bot.editMessageText(
        `ℹ️ ABOUT\n\n${config.shop.about}${support}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'main_menu' }]] },
        }
      );
      return;
    }

    if (data === 'support') {
      const text = config.shop.supportUsername
        ? `💬 SUPPORT\n\nContact us directly:\n👤 ${config.shop.supportUsername}\n\nWe typically respond within a few hours.`
        : `💬 SUPPORT\n\nFor help with your orders, use /orders to check status.\nFor urgent issues, contact the shop admin.`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'main_menu' }]] },
      });
      return;
    }

    // ── Category browse ─────────────────────────────────────────────────

    if (data.startsWith('cat_')) {
      const category = data.slice(4);
      const cat = CATEGORIES[category];
      if (!cat) return;

      const products = ProductHandler.getAllByCategory(category);
      const text = MessageFormatter.productList(cat.name, products);

      const buttons = [];
      for (let i = 0; i < products.length; i += 2) {
        const row = [{ text: products[i].name, callback_data: `prod_${products[i].id}` }];
        if (products[i + 1]) {
          row.push({ text: products[i + 1].name, callback_data: `prod_${products[i + 1].id}` });
        }
        buttons.push(row);
      }
      buttons.push([{ text: '⬅️ Back', callback_data: 'shop_menu' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ── Product detail ──────────────────────────────────────────────────

    if (data.startsWith('prod_')) {
      const productId = data.slice(5);
      const product = ProductHandler.getProduct(productId);
      if (!product) {
        await bot.sendMessage(chatId, '❌ Product not found.');
        return;
      }

      const canOrder = product.available && (product.stock === -1 || product.stock > 0);
      const buttons = [];
      if (canOrder) {
        buttons.push([{ text: '🛒 Order Now', callback_data: `order_${productId}` }]);
      }
      buttons.push([{ text: '⬅️ Back', callback_data: `cat_${product.category}` }]);

      await bot.editMessageText(MessageFormatter.productDetail(product), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    // ── Start order ─────────────────────────────────────────────────────

    if (data.startsWith('order_')) {
      const productId = data.slice(6);
      const product = ProductHandler.getProduct(productId);
      if (!product) return;

      userState.set(userId, { action: 'awaiting_quantity', data: { productId } });
      await bot.editMessageText(
        `🛒 ORDER: ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n\nHow many would you like to order?\n\nType a number (e.g. 1):`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Cancel', callback_data: `prod_${productId}` }]],
          },
        }
      );
      return;
    }

    // ── My Orders ───────────────────────────────────────────────────────

    if (data === 'my_orders') {
      const orders = OrderHandler.getUserOrders(userId);
      if (orders.length === 0) {
        await bot.editMessageText(
          `📦 MY ORDERS\n\nYou haven't placed any orders yet.\n\nStart shopping! 🛍️`,
          {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
              inline_keyboard: [
                [{ text: '🛍️ Browse Shop', callback_data: 'shop_menu' }, { text: '⬅️ Back', callback_data: 'main_menu' }],
              ],
            },
          }
        );
        return;
      }

      let text = `📦 MY ORDERS (${orders.length})\n\n`;
      const buttons = [];
      orders.slice(0, 8).forEach((o, i) => {
        text += `${i + 1}. ${o.productName} — ${config.shop.currencySymbol}${Number(o.total).toFixed(2)} ${STATUS_EMOJI[o.status] || ''}\n`;
        buttons.push([
          { text: `${STATUS_EMOJI[o.status]} #${o.id.slice(-6).toUpperCase()} — ${o.productName}`, callback_data: `myorder_${o.id}` },
        ]);
      });
      buttons.push([{ text: '⬅️ Back', callback_data: 'main_menu' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data.startsWith('myorder_')) {
      const orderId = data.slice(8);
      const order = db.getOrder(orderId);
      if (!order) return;
      await bot.editMessageText(MessageFormatter.orderDetail(order), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'my_orders' }]] },
      });
      return;
    }

    // ── ADMIN PANEL ─────────────────────────────────────────────────────

    if (!db.isAdmin(userId) && data.startsWith('admin_')) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized', true);
      return;
    }

    if (data === 'admin_menu') {
      await bot.editMessageText(MessageFormatter.adminMenu(), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📦 Products', callback_data: 'admin_products' }, { text: '📋 Orders', callback_data: 'admin_orders' }],
            [{ text: '👥 Users', callback_data: 'admin_users' }, { text: '🏦 Bank Details', callback_data: 'admin_bank' }],
            [{ text: '📊 Stats', callback_data: 'admin_stats' }],
            [{ text: '⬅️ Back', callback_data: 'main_menu' }],
          ],
        },
      });
      return;
    }

    // ── Admin: Products ─────────────────────────────────────────────────

    if (data === 'admin_products') {
      const products = Object.values(db.getAllProducts());
      let text = `📦 PRODUCTS (${products.length})\n\n`;
      if (products.length === 0) text += 'No products yet. Add your first one!';

      const buttons = [[{ text: '➕ Add Product', callback_data: 'admin_add_product' }]];
      products.slice(0, 12).forEach(p => {
        const cat = CATEGORIES[p.category];
        buttons.push([
          { text: `${p.available ? '✅' : '❌'} ${p.name} — ${config.shop.currencySymbol}${Number(p.price).toFixed(2)}`, callback_data: `admin_prod_${p.id}` },
        ]);
      });
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_menu' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data === 'admin_add_product') {
      userState.set(userId, { action: 'add_product_name', data: {} });
      await bot.editMessageText(
        `➕ ADD NEW PRODUCT\n\nStep 1 of 5\n\nEnter the product name:`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
        }
      );
      return;
    }

    if (data.startsWith('admin_prod_')) {
      const productId = data.slice(11);
      const product = ProductHandler.getProduct(productId);
      if (!product) return;
      const cat = CATEGORIES[product.category];
      const text = `📦 ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 Category: ${cat ? cat.name : product.category}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}\nStatus: ${product.available ? '✅ Available' : '❌ Unavailable'}`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: product.available ? '❌ Disable' : '✅ Enable', callback_data: `admin_toggle_${productId}` },
              { text: '🗑️ Delete', callback_data: `admin_delete_${productId}` },
            ],
            [{ text: '⬅️ Back', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    if (data.startsWith('admin_toggle_')) {
      const productId = data.slice(13);
      const product = ProductHandler.toggleAvailability(productId);
      if (!product) return;
      const cat = CATEGORIES[product.category];
      const text = `📦 ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 Category: ${cat ? cat.name : product.category}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}\nStatus: ${product.available ? '✅ Available' : '❌ Unavailable'}`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [
              { text: product.available ? '❌ Disable' : '✅ Enable', callback_data: `admin_toggle_${productId}` },
              { text: '🗑️ Delete', callback_data: `admin_delete_${productId}` },
            ],
            [{ text: '⬅️ Back', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    if (data.startsWith('admin_delete_')) {
      const productId = data.slice(13);
      ProductHandler.deleteProduct(productId);
      await bot.editMessageText('🗑️ Product deleted successfully.', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_products' }]] },
      });
      return;
    }

    // Category selection during add-product flow
    if (data.startsWith('admin_cat_select_')) {
      const category = data.slice(17);
      const state = userState.get(userId);
      if (!state || state.action !== 'add_product_category') return;
      state.data.category = category;
      state.action = 'add_product_stock';
      userState.set(userId, state);
      await bot.editMessageText(
        `➕ ADD NEW PRODUCT\n\nStep 5 of 5\n\nEnter stock quantity:\n(-1 for unlimited, or a number like 10)`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
        }
      );
      return;
    }

    // ── Admin: Orders ───────────────────────────────────────────────────

    if (data === 'admin_orders') {
      const pending = OrderHandler.getPendingOrders();
      const all = OrderHandler.getAllOrders();
      let text = `📋 ORDERS\n\n⏳ Pending: ${pending.length}  |  📊 Total: ${all.length}\n\n`;

      const buttons = [];
      if (pending.length > 0) {
        text += `PENDING ORDERS:\n`;
        pending.slice(0, 8).forEach(o => {
          buttons.push([
            { text: `⏳ @${o.username} — ${o.productName} — ${config.shop.currencySymbol}${Number(o.total).toFixed(2)}`, callback_data: `admin_order_${o.id}` },
          ]);
        });
      } else {
        text += 'No pending orders.';
      }
      buttons.push([
        { text: '📋 All Orders', callback_data: 'admin_all_orders' },
        { text: '⬅️ Back', callback_data: 'admin_menu' },
      ]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data === 'admin_all_orders') {
      const orders = OrderHandler.getAllOrders().slice(0, 10);
      let text = `📋 ALL ORDERS (${orders.length})\n\n`;
      if (orders.length === 0) text += 'No orders yet.';

      const buttons = orders.map(o => [
        { text: `${STATUS_EMOJI[o.status]} @${o.username} — ${o.productName}`, callback_data: `admin_order_${o.id}` },
      ]);
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_orders' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data.startsWith('admin_order_')) {
      const orderId = data.slice(12);
      const order = db.getOrder(orderId);
      if (!order) return;

      const text = `📋 ORDER DETAIL\n\n#${order.id.slice(-6).toUpperCase()}\n👤 @${order.username} (${order.userId})\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n📊 Status: ${STATUS_EMOJI[order.status]} ${order.status}\n📅 Date: ${new Date(order.createdAt).toLocaleString()}`;
      const buttons = [];
      if (order.status === 'pending') {
        buttons.push([
          { text: '✅ Confirm', callback_data: `admin_confirm_${orderId}` },
          { text: '❌ Cancel', callback_data: `admin_cancel_${orderId}` },
        ]);
      }
      if (order.status === 'confirmed') {
        buttons.push([{ text: '🚚 Mark Delivered', callback_data: `admin_deliver_${orderId}` }]);
      }
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_orders' }]);

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: buttons },
      });
      return;
    }

    if (data.startsWith('admin_confirm_')) {
      const orderId = data.slice(14);
      const order = OrderHandler.confirmOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(
          order.chatId,
          `✅ ORDER CONFIRMED!\n\n#${order.id.slice(-6).toUpperCase()}\nYour order for "${order.productName}" has been confirmed!\n\nThank you for shopping with us! 🛍️`
        );
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await bot.editMessageText(
        `✅ Order #${order.id.slice(-6).toUpperCase()} confirmed. User has been notified.`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚚 Mark Delivered', callback_data: `admin_deliver_${orderId}` }],
              [{ text: '⬅️ Back', callback_data: 'admin_orders' }],
            ],
          },
        }
      );
      return;
    }

    if (data.startsWith('admin_cancel_')) {
      const orderId = data.slice(13);
      const order = OrderHandler.cancelOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(
          order.chatId,
          `❌ ORDER CANCELLED\n\n#${order.id.slice(-6).toUpperCase()}\nYour order for "${order.productName}" was cancelled.\n\nFor questions, contact support.`
        );
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await bot.editMessageText(`❌ Order cancelled. User notified.`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_orders' }]] },
      });
      return;
    }

    if (data.startsWith('admin_deliver_')) {
      const orderId = data.slice(14);
      const order = OrderHandler.deliverOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(
          order.chatId,
          `🚚 ORDER DELIVERED!\n\n#${order.id.slice(-6).toUpperCase()}\nYour order for "${order.productName}" has been delivered!\n\nEnjoy your purchase! 🎉`
        );
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await bot.editMessageText(`🚚 Order marked as delivered. User notified.`, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_orders' }]] },
      });
      return;
    }

    // ── Admin: Users ────────────────────────────────────────────────────

    if (data === 'admin_users') {
      const users = AdminHandler.getUsers(15);
      let text = `👥 USERS (${Object.keys(db.getAllUsers()).length})\n\n`;
      users.forEach((u, i) => {
        text += `${i + 1}. @${u.username} (ID: ${u.id})\n`;
      });
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]] },
      });
      return;
    }

    // ── Admin: Bank Details ─────────────────────────────────────────────

    if (data === 'admin_bank') {
      const bank = db.getBankDetails();
      const hasBank = bank.accountName || bank.accountNumber;
      const text = `🏦 BANK DETAILS\n\n${
        hasBank
          ? `Name: ${bank.accountName}\nAccount: ${bank.accountNumber}\nBank: ${bank.bankName}`
          : 'No bank details set yet.'
      }\n\nTo update, send a message in this format:\nNAME | ACCOUNT_NUMBER | BANK_NAME`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]] },
      });
      userState.set(userId, { action: 'update_bank', data: {} });
      return;
    }

    // ── Admin: Stats ────────────────────────────────────────────────────

    if (data === 'admin_stats') {
      const s = AdminHandler.getSystemStats();
      const text = `📊 STORE STATISTICS\n${'─'.repeat(26)}\n👥 Users: ${s.totalUsers}\n📦 Products: ${s.totalProducts}\n📋 Total Orders: ${s.totalOrders}\n⏳ Pending: ${s.pendingOrders}\n✅ Confirmed: ${s.confirmedOrders}\n🚚 Delivered: ${s.deliveredOrders}\n💰 Revenue: ${config.shop.currencySymbol}${s.totalRevenue.toFixed(2)}\n👮 Admins: ${s.totalAdmins}\n🚫 Banned: ${s.bannedUsers}`;
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]] },
      });
      return;
    }
  } catch (error) {
    Logger.error(`Callback error: ${error.message}`);
  }
});

// ── Message handler ────────────────────────────────────────────────────────

bot.on('message', async msg => {
  if (!msg.from || msg.chat.type !== 'private') return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `User${userId}`;
  const text = msg.text || '';
  const isPhoto = msg.photo && msg.photo.length > 0;

  if (db.isBanned(userId)) return;

  syncUser(userId, username, chatId);

  // Handle slash commands
  if (text.startsWith('/') && !text.startsWith('/start')) {
    const parts = text.trim().split(' ');
    if (db.isAdmin(userId)) {
      await CommandProcessor.processAdminCommand(bot, chatId, userId, text, parts);
      return;
    }
    await CommandProcessor.processUserCommand(bot, chatId, userId, text, parts);
    return;
  }

  const state = userState.get(userId);

  // ── Payment screenshot ───────────────────────────────────────────

  if (isPhoto && state && state.action === 'awaiting_payment_screenshot') {
    const { productId, quantity } = state.data;
    const product = ProductHandler.getProduct(productId);
    if (!product) {
      await bot.sendMessage(chatId, '❌ Product not found. Please try again from /start.');
      userState.delete(userId);
      return;
    }

    const order = OrderHandler.createOrder({
      userId,
      username,
      chatId,
      productId,
      productName: product.name,
      price: product.price,
      quantity,
    });

    userState.delete(userId);

    await bot.sendMessage(
      chatId,
      `✅ ORDER PLACED!\n\n#${order.id.slice(-6).toUpperCase()}\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n⏳ Status: Pending\n\nWe received your payment and will confirm your order shortly. Thank you! 🎉`
    );

    // Notify all admins
    for (const adminId of db.getAdmins()) {
      try {
        const adminUser = db.getUser(adminId);
        await bot.sendPhoto(adminUser.chatId, msg.photo[msg.photo.length - 1].file_id, {
          caption: `🔔 NEW ORDER!\n\n#${order.id.slice(-6).toUpperCase()}\n👤 @${username} (${userId})\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n\nOpen admin panel to confirm.`,
        });
      } catch (e) {
        Logger.warn(`Could not notify admin ${adminId}`);
      }
    }
    return;
  }

  // ── State machine for text input ─────────────────────────────────

  if (state) {
    // Admin: Add product — name
    if (state.action === 'add_product_name') {
      state.data.name = text.trim();
      state.action = 'add_product_desc';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ ADD NEW PRODUCT\n\nStep 2 of 5\n\nEnter the product description:`, {
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
      });
      return;
    }

    // Admin: Add product — description
    if (state.action === 'add_product_desc') {
      state.data.description = text.trim();
      state.action = 'add_product_price';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ ADD NEW PRODUCT\n\nStep 3 of 5\n\nEnter the price (e.g. 9.99):`, {
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
      });
      return;
    }

    // Admin: Add product — price
    if (state.action === 'add_product_price') {
      const price = parseFloat(text.trim());
      if (isNaN(price) || price <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid price. Please enter a positive number (e.g. 9.99):');
        return;
      }
      state.data.price = price;
      state.action = 'add_product_category';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ ADD NEW PRODUCT\n\nStep 4 of 5\n\nSelect the product category:`, {
        reply_markup: {
          inline_keyboard: [
            ...Object.entries(CATEGORIES).map(([key, cat]) => [
              { text: cat.name, callback_data: `admin_cat_select_${key}` },
            ]),
            [{ text: '❌ Cancel', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    // Admin: Add product — stock (after category selected via callback)
    if (state.action === 'add_product_stock') {
      const stock = parseInt(text.trim());
      if (isNaN(stock) || stock < -1) {
        await bot.sendMessage(chatId, '❌ Invalid stock. Enter -1 for unlimited or a number (e.g. 10):');
        return;
      }
      state.data.stock = stock;
      const product = ProductHandler.addProduct(state.data);
      userState.delete(userId);
      await bot.sendMessage(
        chatId,
        `✅ PRODUCT ADDED!\n\n📦 ${product.name}\n💰 ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 ${CATEGORIES[product.category].name}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}`,
        { reply_markup: { inline_keyboard: [[{ text: '📦 View Products', callback_data: 'admin_products' }]] } }
      );
      return;
    }

    // User: Quantity for order
    if (state.action === 'awaiting_quantity') {
      const quantity = parseInt(text.trim());
      if (isNaN(quantity) || quantity <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid quantity. Please enter a positive number (e.g. 1):');
        return;
      }
      const { productId } = state.data;
      const product = ProductHandler.getProduct(productId);
      if (!product) {
        await bot.sendMessage(chatId, '❌ Product not found. Use /start to try again.');
        userState.delete(userId);
        return;
      }
      state.action = 'awaiting_payment_screenshot';
      state.data.quantity = quantity;
      userState.set(userId, state);

      const bankDetails = db.getBankDetails();
      await bot.sendMessage(chatId, MessageFormatter.orderSummary(product, quantity, bankDetails), {
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: `prod_${productId}` }]] },
      });
      return;
    }

    // Admin: Update bank details
    if (state.action === 'update_bank') {
      if (text.includes('|')) {
        const parts = text.split('|').map(p => p.trim());
        if (parts.length === 3) {
          AdminHandler.updateBankDetails(parts[0], parts[1], parts[2]);
          userState.delete(userId);
          await bot.sendMessage(chatId, '✅ Bank details updated successfully!');
          return;
        }
      }
      await bot.sendMessage(chatId, '❌ Invalid format. Use: NAME | ACCOUNT_NUMBER | BANK_NAME');
      return;
    }
  }

  // Default fallback
  if (!state) {
    await bot.sendMessage(chatId, `👋 Hi ${username}! Use /start to open the shop menu.`);
  }
});

// ── Error handling ─────────────────────────────────────────────────────────

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

Logger.success('🛍️ Shop Bot is running and listening for messages...');
