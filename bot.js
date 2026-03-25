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

// Step progress bar for add-product flow
function stepBar(current, total) {
  return Array.from({ length: total }, (_, i) => (i < current ? '🟩' : '⬜')).join('');
}

Logger.success(`${config.shop.name} Bot initialized`);
Logger.info(`Bot Username: ${config.bot.username.startsWith('@') ? config.bot.username : '@' + config.bot.username}`);

// ── Helpers ────────────────────────────────────────────────────────────────

function syncUser(userId, username, chatId) {
  db.updateUser(userId, { username, chatId, verified: true });
  return db.getUser(userId);
}

function isPhotoMessage(msg) {
  return !!(msg.photo && msg.photo.length > 0);
}

async function safeDelete(chatId, messageId) {
  try { await bot.deleteMessage(chatId, messageId); } catch (_) {}
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

async function editToTextMessage(chatId, messageId, isPhoto, text, keyboard) {
  if (isPhoto) {
    await safeDelete(chatId, messageId);
    await bot.sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
  } else {
    await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: keyboard } });
  }
}

function buildProductButtons(product) {
  const canOrder = product.available && (product.stock === -1 || product.stock > 0);
  const buttons = [];
  if (canOrder) buttons.push([{ text: '🛒 Order Now', callback_data: `order_${product.id}` }]);
  buttons.push([{ text: '⬅️ Back to Category', callback_data: `cat_${product.category}` }]);
  return buttons;
}

function buildAdminProductButtons(product) {
  return [
    [
      { text: product.available ? '❌ Disable' : '✅ Enable', callback_data: `admin_toggle_${product.id}` },
      { text: '🗑️ Delete', callback_data: `admin_delete_${product.id}` },
    ],
    [{ text: '⬅️ Back to Products', callback_data: 'admin_products' }],
  ];
}

function productAdminCaption(product) {
  const cat = CATEGORIES[product.category];
  return `📦 ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 Category: ${cat ? cat.name : product.category}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}\nStatus: ${product.available ? '✅ Available' : '❌ Unavailable'}`;
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
  const isPhoto = isPhotoMessage(query.message);

  if (db.isBanned(userId)) {
    await bot.answerCallbackQuery(query.id, '🚫 You are banned.', true);
    return;
  }

  await bot.answerCallbackQuery(query.id).catch(() => {});

  try {

    // ── Main menu ────────────────────────────────────────────────────────
    if (data === 'main_menu') {
      userState.delete(userId);
      const isAdmin = db.isAdmin(userId);
      const buttons = [
        [{ text: '🛍️ Browse Shop', callback_data: 'shop_menu' }, { text: 'ℹ️ About', callback_data: 'about' }],
        [{ text: '📦 My Orders', callback_data: 'my_orders' }, { text: '💬 Support', callback_data: 'support' }],
      ];
      if (isAdmin) buttons.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_menu' }]);
      await editToTextMessage(chatId, messageId, isPhoto, MessageFormatter.mainMenu(username), buttons);
      return;
    }

    // ── Shop menu ────────────────────────────────────────────────────────
    if (data === 'shop_menu') {
      const buttons = Object.entries(CATEGORIES).map(([key, cat]) => [
        { text: cat.name, callback_data: `cat_${key}` },
      ]);
      buttons.push([{ text: '⬅️ Back', callback_data: 'main_menu' }]);
      await editToTextMessage(chatId, messageId, isPhoto, MessageFormatter.categoryMenu(), buttons);
      return;
    }

    // ── About ────────────────────────────────────────────────────────────
    if (data === 'about') {
      const support = config.shop.supportUsername ? `\n\n💬 Support: ${config.shop.supportUsername}` : '';
      await editToTextMessage(
        chatId, messageId, isPhoto,
        `ℹ️ ABOUT\n\n${config.shop.about}${support}`,
        [[{ text: '⬅️ Back', callback_data: 'main_menu' }]]
      );
      return;
    }

    // ── Support ──────────────────────────────────────────────────────────
    if (data === 'support') {
      const text = config.shop.supportUsername
        ? `💬 SUPPORT\n\nContact us directly:\n👤 ${config.shop.supportUsername}\n\nWe typically reply within a few hours.`
        : `💬 SUPPORT\n\nFor order status, use /orders.\nFor urgent issues, contact the shop admin.`;
      await editToTextMessage(chatId, messageId, isPhoto, text, [[{ text: '⬅️ Back', callback_data: 'main_menu' }]]);
      return;
    }

    // ── Category browse ──────────────────────────────────────────────────
    if (data.startsWith('cat_')) {
      const category = data.slice(4);
      const cat = CATEGORIES[category];
      if (!cat) return;

      const products = ProductHandler.getAllByCategory(category);
      const text = MessageFormatter.productList(cat.name, products);
      const buttons = [];
      for (let i = 0; i < products.length; i += 2) {
        const row = [{ text: products[i].name, callback_data: `prod_${products[i].id}` }];
        if (products[i + 1]) row.push({ text: products[i + 1].name, callback_data: `prod_${products[i + 1].id}` });
        buttons.push(row);
      }
      buttons.push([{ text: '⬅️ Back', callback_data: 'shop_menu' }]);

      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    // ── Product detail (customer view) ───────────────────────────────────
    if (data.startsWith('prod_') && !data.startsWith('prod_cat')) {
      const productId = data.slice(5);
      const product = ProductHandler.getProduct(productId);
      if (!product) { await bot.sendMessage(chatId, '❌ Product not found.'); return; }

      const buttons = buildProductButtons(product);
      const caption = MessageFormatter.productDetail(product);

      if (product.photoFileId) {
        // Show photo — delete old message, send new photo message
        await safeDelete(chatId, messageId);
        await bot.sendPhoto(chatId, product.photoFileId, {
          caption,
          reply_markup: { inline_keyboard: buttons },
        });
      } else {
        await editToTextMessage(chatId, messageId, isPhoto, caption, buttons);
      }
      return;
    }

    // ── Start order ──────────────────────────────────────────────────────
    if (data.startsWith('order_')) {
      const productId = data.slice(6);
      const product = ProductHandler.getProduct(productId);
      if (!product) return;

      userState.set(userId, { action: 'awaiting_quantity', data: { productId } });
      const prompt = `🛒 ORDER: ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n\nHow many would you like to order?\n\nReply with a number (e.g. 1):`;
      const keyboard = [[{ text: '❌ Cancel', callback_data: `prod_${productId}` }]];

      // If current message is a photo (product photo), edit its caption
      if (isPhoto) {
        await bot.editMessageCaption(prompt, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: keyboard },
        });
      } else {
        await bot.editMessageText(prompt, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: keyboard },
        });
      }
      return;
    }

    // ── My Orders ────────────────────────────────────────────────────────
    if (data === 'my_orders') {
      const orders = OrderHandler.getUserOrders(userId);
      if (orders.length === 0) {
        await editToTextMessage(
          chatId, messageId, isPhoto,
          `📦 MY ORDERS\n\nYou haven't placed any orders yet.\n\nStart shopping! 🛍️`,
          [[{ text: '🛍️ Browse Shop', callback_data: 'shop_menu' }, { text: '⬅️ Back', callback_data: 'main_menu' }]]
        );
        return;
      }

      let text = `📦 MY ORDERS (${orders.length})\n\n`;
      const buttons = [];
      orders.slice(0, 8).forEach((o, i) => {
        text += `${i + 1}. ${o.productName} — ${config.shop.currencySymbol}${Number(o.total).toFixed(2)} ${STATUS_EMOJI[o.status] || ''}\n`;
        buttons.push([{ text: `${STATUS_EMOJI[o.status]} #${o.id.slice(-6).toUpperCase()} — ${o.productName}`, callback_data: `myorder_${o.id}` }]);
      });
      buttons.push([{ text: '⬅️ Back', callback_data: 'main_menu' }]);
      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    if (data.startsWith('myorder_')) {
      const orderId = data.slice(8);
      const order = db.getOrder(orderId);
      if (!order) return;
      await editToTextMessage(
        chatId, messageId, isPhoto,
        MessageFormatter.orderDetail(order),
        [[{ text: '⬅️ Back', callback_data: 'my_orders' }]]
      );
      return;
    }

    // ── ADMIN PANEL ──────────────────────────────────────────────────────

    if (!db.isAdmin(userId) && data.startsWith('admin_')) {
      await bot.answerCallbackQuery(query.id, '❌ Not authorized', true);
      return;
    }

    if (data === 'admin_menu') {
      await editToTextMessage(chatId, messageId, isPhoto, MessageFormatter.adminMenu(), [
        [{ text: '📦 Products', callback_data: 'admin_products' }, { text: '📋 Orders', callback_data: 'admin_orders' }],
        [{ text: '👥 Users', callback_data: 'admin_users' }, { text: '🏦 Bank Details', callback_data: 'admin_bank' }],
        [{ text: '📊 Stats', callback_data: 'admin_stats' }],
        [{ text: '⬅️ Back', callback_data: 'main_menu' }],
      ]);
      return;
    }

    // ── Admin: Products list ─────────────────────────────────────────────
    if (data === 'admin_products') {
      const products = Object.values(db.getAllProducts());
      let text = `📦 PRODUCTS (${products.length})\n\n`;
      if (products.length === 0) text += 'No products yet. Tap "Add Product" to create your first one!';

      const buttons = [[{ text: '➕ Add Product', callback_data: 'admin_add_product' }]];
      products.slice(0, 12).forEach(p => {
        const cat = CATEGORIES[p.category];
        const icon = p.photoFileId ? '🖼️ ' : '';
        buttons.push([{
          text: `${p.available ? '✅' : '❌'} ${icon}${p.name} — ${config.shop.currencySymbol}${Number(p.price).toFixed(2)}`,
          callback_data: `admin_prod_${p.id}`,
        }]);
      });
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_menu' }]);
      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    // ── Admin: Start add product flow ────────────────────────────────────
    if (data === 'admin_add_product') {
      userState.set(userId, { action: 'add_product_name', data: {} });
      await editToTextMessage(
        chatId, messageId, isPhoto,
        `➕ NEW PRODUCT\n${stepBar(0, 6)} Step 1/6\n\n📝 Enter the product name:`,
        [[{ text: '❌ Cancel', callback_data: 'admin_products' }]]
      );
      return;
    }

    // ── Admin: View/manage single product ────────────────────────────────
    if (data.startsWith('admin_prod_')) {
      const productId = data.slice(11);
      const product = ProductHandler.getProduct(productId);
      if (!product) return;

      const caption = productAdminCaption(product);
      const buttons = buildAdminProductButtons(product);

      if (product.photoFileId) {
        await safeDelete(chatId, messageId);
        await bot.sendPhoto(chatId, product.photoFileId, { caption, reply_markup: { inline_keyboard: buttons } });
      } else {
        await editToTextMessage(chatId, messageId, isPhoto, caption, buttons);
      }
      return;
    }

    // ── Admin: Toggle product availability ───────────────────────────────
    if (data.startsWith('admin_toggle_')) {
      const productId = data.slice(13);
      const product = ProductHandler.toggleAvailability(productId);
      if (!product) return;

      const caption = productAdminCaption(product);
      const buttons = buildAdminProductButtons(product);

      if (product.photoFileId) {
        if (isPhoto) {
          await bot.editMessageCaption(caption, { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: buttons } });
        } else {
          await safeDelete(chatId, messageId);
          await bot.sendPhoto(chatId, product.photoFileId, { caption, reply_markup: { inline_keyboard: buttons } });
        }
      } else {
        await editToTextMessage(chatId, messageId, isPhoto, caption, buttons);
      }
      return;
    }

    // ── Admin: Delete product ────────────────────────────────────────────
    if (data.startsWith('admin_delete_')) {
      const productId = data.slice(13);
      ProductHandler.deleteProduct(productId);
      await editToTextMessage(chatId, messageId, isPhoto, '🗑️ Product deleted successfully.', [[{ text: '⬅️ Back to Products', callback_data: 'admin_products' }]]);
      return;
    }

    // ── Admin: Category select during add-product flow ───────────────────
    if (data.startsWith('admin_cat_select_')) {
      const category = data.slice(17);
      const state = userState.get(userId);
      if (!state || state.action !== 'add_product_category') return;
      state.data.category = category;
      state.action = 'add_product_stock';
      userState.set(userId, state);
      await editToTextMessage(
        chatId, messageId, isPhoto,
        `➕ NEW PRODUCT\n${stepBar(4, 6)} Step 5/6\n\n📦 Stock quantity:\n\nEnter -1 for unlimited, or a specific number (e.g. 50):`,
        [[{ text: '❌ Cancel', callback_data: 'admin_products' }]]
      );
      return;
    }

    // ── Admin: Skip photo during add-product flow ────────────────────────
    if (data === 'admin_skip_photo') {
      const state = userState.get(userId);
      if (!state || state.action !== 'add_product_photo') return;
      state.data.photoFileId = null;
      const product = ProductHandler.addProduct(state.data);
      userState.delete(userId);
      const cat = CATEGORIES[product.category];
      await editToTextMessage(
        chatId, messageId, isPhoto,
        `✅ PRODUCT ADDED!\n${'─'.repeat(26)}\n📦 ${product.name}\n💰 ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 ${cat ? cat.name : product.category}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}\n🖼️ No image`,
        [[{ text: '📦 View All Products', callback_data: 'admin_products' }, { text: '➕ Add Another', callback_data: 'admin_add_product' }]]
      );
      return;
    }

    // ── Admin: Orders ─────────────────────────────────────────────────────
    if (data === 'admin_orders') {
      const pending = OrderHandler.getPendingOrders();
      const all = OrderHandler.getAllOrders();
      let text = `📋 ORDERS\n\n⏳ Pending: ${pending.length}  |  📊 Total: ${all.length}\n\n`;
      const buttons = [];
      if (pending.length > 0) {
        text += `PENDING ORDERS:\n`;
        pending.slice(0, 8).forEach(o => {
          buttons.push([{ text: `⏳ @${o.username} — ${o.productName} — ${config.shop.currencySymbol}${Number(o.total).toFixed(2)}`, callback_data: `admin_order_${o.id}` }]);
        });
      } else {
        text += 'No pending orders right now.';
      }
      buttons.push([{ text: '📋 All Orders', callback_data: 'admin_all_orders' }, { text: '⬅️ Back', callback_data: 'admin_menu' }]);
      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    if (data === 'admin_all_orders') {
      const orders = OrderHandler.getAllOrders().slice(0, 10);
      let text = `📋 ALL ORDERS (${orders.length})\n\n`;
      if (orders.length === 0) text += 'No orders yet.';
      const buttons = orders.map(o => [{ text: `${STATUS_EMOJI[o.status]} @${o.username} — ${o.productName}`, callback_data: `admin_order_${o.id}` }]);
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_orders' }]);
      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    if (data.startsWith('admin_order_')) {
      const orderId = data.slice(12);
      const order = db.getOrder(orderId);
      if (!order) return;
      const text = `📋 ORDER DETAIL\n${'─'.repeat(26)}\n#${order.id.slice(-6).toUpperCase()}\n👤 @${order.username} (ID: ${order.userId})\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n📊 Status: ${STATUS_EMOJI[order.status]} ${order.status}\n📅 Date: ${new Date(order.createdAt).toLocaleString()}`;
      const buttons = [];
      if (order.status === 'pending') {
        buttons.push([{ text: '✅ Confirm Order', callback_data: `admin_confirm_${orderId}` }, { text: '❌ Cancel Order', callback_data: `admin_cancel_${orderId}` }]);
      }
      if (order.status === 'confirmed') {
        buttons.push([{ text: '🚚 Mark as Delivered', callback_data: `admin_deliver_${orderId}` }]);
      }
      buttons.push([{ text: '⬅️ Back', callback_data: 'admin_orders' }]);
      await editToTextMessage(chatId, messageId, isPhoto, text, buttons);
      return;
    }

    if (data.startsWith('admin_confirm_')) {
      const orderId = data.slice(14);
      const order = OrderHandler.confirmOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(order.chatId, `✅ ORDER CONFIRMED!\n\n#${order.id.slice(-6).toUpperCase()}\nYour order for "${order.productName}" has been confirmed!\n\nThank you for shopping with us! 🛍️`);
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await editToTextMessage(chatId, messageId, isPhoto, `✅ Order #${order.id.slice(-6).toUpperCase()} confirmed. User notified.`, [
        [{ text: '🚚 Mark as Delivered', callback_data: `admin_deliver_${orderId}` }],
        [{ text: '⬅️ Back to Orders', callback_data: 'admin_orders' }],
      ]);
      return;
    }

    if (data.startsWith('admin_cancel_')) {
      const orderId = data.slice(13);
      const order = OrderHandler.cancelOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(order.chatId, `❌ ORDER CANCELLED\n\n#${order.id.slice(-6).toUpperCase()}\nYour order for "${order.productName}" was cancelled.\n\nFor questions, contact support.`);
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await editToTextMessage(chatId, messageId, isPhoto, `❌ Order cancelled. User has been notified.`, [[{ text: '⬅️ Back to Orders', callback_data: 'admin_orders' }]]);
      return;
    }

    if (data.startsWith('admin_deliver_')) {
      const orderId = data.slice(14);
      const order = OrderHandler.deliverOrder(orderId);
      if (!order) return;
      try {
        await bot.sendMessage(order.chatId, `🚚 ORDER DELIVERED!\n\n#${order.id.slice(-6).toUpperCase()}\nYour "${order.productName}" has been delivered!\n\nEnjoy your purchase! 🎉`);
      } catch (e) { Logger.warn(`Could not notify user ${order.userId}`); }
      await editToTextMessage(chatId, messageId, isPhoto, `🚚 Order marked as delivered. User notified.`, [[{ text: '⬅️ Back to Orders', callback_data: 'admin_orders' }]]);
      return;
    }

    // ── Admin: Users ──────────────────────────────────────────────────────
    if (data === 'admin_users') {
      const users = AdminHandler.getUsers(15);
      let text = `👥 USERS (${Object.keys(db.getAllUsers()).length})\n\n`;
      users.forEach((u, i) => { text += `${i + 1}. @${u.username} (ID: ${u.id})\n`; });
      await editToTextMessage(chatId, messageId, isPhoto, text, [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]]);
      return;
    }

    // ── Admin: Bank Details ───────────────────────────────────────────────
    if (data === 'admin_bank') {
      const bank = db.getBankDetails();
      const hasBank = bank.accountName || bank.accountNumber;
      const text = `🏦 BANK DETAILS\n\n${hasBank
        ? `Bank: ${bank.bankName}\nName: ${bank.accountName}\nAccount: ${bank.accountNumber}`
        : 'No bank details set yet.'}\n\n✏️ To update, reply with:\nNAME | ACCOUNT_NUMBER | BANK_NAME`;
      await editToTextMessage(chatId, messageId, isPhoto, text, [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]]);
      userState.set(userId, { action: 'update_bank', data: {} });
      return;
    }

    // ── Admin: Stats ──────────────────────────────────────────────────────
    if (data === 'admin_stats') {
      const s = AdminHandler.getSystemStats();
      const text = `📊 STORE STATISTICS\n${'─'.repeat(26)}\n👥 Users: ${s.totalUsers}\n📦 Products: ${s.totalProducts}\n\n📋 Total Orders: ${s.totalOrders}\n⏳ Pending: ${s.pendingOrders}\n✅ Confirmed: ${s.confirmedOrders}\n🚚 Delivered: ${s.deliveredOrders}\n\n💰 Revenue: ${config.shop.currencySymbol}${s.totalRevenue.toFixed(2)}\n\n👮 Admins: ${s.totalAdmins}\n🚫 Banned: ${s.bannedUsers}`;
      await editToTextMessage(chatId, messageId, isPhoto, text, [[{ text: '⬅️ Back', callback_data: 'admin_menu' }]]);
      return;
    }

  } catch (error) {
    Logger.error(`Callback error: ${error.message}`);
  }
});

// ── Message handler ─────────────────────────────────────────────────────────

bot.on('message', async msg => {
  if (!msg.from || msg.chat.type !== 'private') return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || `User${userId}`;
  const text = msg.text || '';
  const hasPhoto = !!(msg.photo && msg.photo.length > 0);

  if (db.isBanned(userId)) return;
  syncUser(userId, username, chatId);

  // Slash commands
  if (text.startsWith('/') && !text.startsWith('/start')) {
    const parts = text.trim().split(' ');
    if (db.isAdmin(userId)) {
      await CommandProcessor.processAdminCommand(bot, chatId, userId, text, parts);
    } else {
      await CommandProcessor.processUserCommand(bot, chatId, userId, text, parts);
    }
    return;
  }

  const state = userState.get(userId);

  // ── Payment screenshot ────────────────────────────────────────────────
  if (hasPhoto && state && state.action === 'awaiting_payment_screenshot') {
    const { productId, quantity } = state.data;
    const product = ProductHandler.getProduct(productId);
    if (!product) {
      await bot.sendMessage(chatId, '❌ Product no longer exists. Use /start to try again.');
      userState.delete(userId);
      return;
    }

    const order = OrderHandler.createOrder({ userId, username, chatId, productId, productName: product.name, price: product.price, quantity });
    userState.delete(userId);

    await bot.sendMessage(
      chatId,
      `✅ ORDER PLACED!\n${'─'.repeat(26)}\n#${order.id.slice(-6).toUpperCase()}\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n⏳ Status: Pending\n\nWe received your payment screenshot and will confirm your order shortly!\n\nThank you for shopping with us 🛍️`
    );

    for (const adminId of db.getAdmins()) {
      try {
        const adminUser = db.getUser(adminId);
        await bot.sendPhoto(adminUser.chatId, msg.photo[msg.photo.length - 1].file_id, {
          caption: `🔔 NEW ORDER!\n${'─'.repeat(26)}\n#${order.id.slice(-6).toUpperCase()}\n👤 @${username} (ID: ${userId})\n📦 ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n\nOpen admin panel to confirm.`,
        });
      } catch (e) { Logger.warn(`Could not notify admin ${adminId}`); }
    }
    return;
  }

  // ── Admin photo for add-product flow ─────────────────────────────────
  if (hasPhoto && state && state.action === 'add_product_photo') {
    state.data.photoFileId = msg.photo[msg.photo.length - 1].file_id;
    const product = ProductHandler.addProduct(state.data);
    userState.delete(userId);
    const cat = CATEGORIES[product.category];
    await bot.sendPhoto(chatId, product.photoFileId, {
      caption: `✅ PRODUCT ADDED!\n${'─'.repeat(26)}\n📦 ${product.name}\n💰 ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n📂 ${cat ? cat.name : product.category}\n📋 ${product.description}\n📦 Stock: ${product.stock === -1 ? 'Unlimited' : product.stock}\n🖼️ Image saved ✅`,
      reply_markup: { inline_keyboard: [[{ text: '📦 View All Products', callback_data: 'admin_products' }, { text: '➕ Add Another', callback_data: 'admin_add_product' }]] },
    });
    return;
  }

  // ── State machine for text input ──────────────────────────────────────
  if (state) {

    // Step 1: Product name
    if (state.action === 'add_product_name') {
      if (!text.trim()) { await bot.sendMessage(chatId, '❌ Name cannot be empty. Please enter a product name:'); return; }
      state.data.name = text.trim();
      state.action = 'add_product_desc';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ NEW PRODUCT\n${stepBar(1, 6)} Step 2/6\n\n📋 Enter the product description:\n\n(Describe what the customer will receive)`, {
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
      });
      return;
    }

    // Step 2: Description
    if (state.action === 'add_product_desc') {
      if (!text.trim()) { await bot.sendMessage(chatId, '❌ Description cannot be empty. Please enter a description:'); return; }
      state.data.description = text.trim();
      state.action = 'add_product_price';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ NEW PRODUCT\n${stepBar(2, 6)} Step 3/6\n\n💰 Enter the price:\n\n(e.g. 9.99 or 25)`, {
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'admin_products' }]] },
      });
      return;
    }

    // Step 3: Price
    if (state.action === 'add_product_price') {
      const price = parseFloat(text.trim());
      if (isNaN(price) || price <= 0) {
        await bot.sendMessage(chatId, '❌ Invalid price. Please enter a positive number (e.g. 9.99):');
        return;
      }
      state.data.price = price;
      state.action = 'add_product_category';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ NEW PRODUCT\n${stepBar(3, 6)} Step 4/6\n\n📂 Select the product category:`, {
        reply_markup: {
          inline_keyboard: [
            ...Object.entries(CATEGORIES).map(([key, cat]) => [{ text: cat.name, callback_data: `admin_cat_select_${key}` }]),
            [{ text: '❌ Cancel', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    // Step 5: Stock (after category selected via button)
    if (state.action === 'add_product_stock') {
      const stock = parseInt(text.trim());
      if (isNaN(stock) || stock < -1) {
        await bot.sendMessage(chatId, '❌ Invalid stock. Enter -1 for unlimited or a number like 10:');
        return;
      }
      state.data.stock = stock;
      state.action = 'add_product_photo';
      userState.set(userId, state);
      await bot.sendMessage(chatId, `➕ NEW PRODUCT\n${stepBar(5, 6)} Step 6/6\n\n🖼️ Send a product photo\n\nor tap "Skip" to add without an image:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⏭️ Skip (no image)', callback_data: 'admin_skip_photo' }],
            [{ text: '❌ Cancel', callback_data: 'admin_products' }],
          ],
        },
      });
      return;
    }

    // Quantity for order
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
        reply_markup: { inline_keyboard: [[{ text: '❌ Cancel Order', callback_data: `prod_${productId}` }]] },
      });
      return;
    }

    // Update bank details
    if (state.action === 'update_bank') {
      if (text.includes('|')) {
        const parts = text.split('|').map(p => p.trim());
        if (parts.length === 3 && parts.every(p => p.length > 0)) {
          AdminHandler.updateBankDetails(parts[0], parts[1], parts[2]);
          userState.delete(userId);
          await bot.sendMessage(chatId, `✅ Bank details updated!\n\nName: ${parts[0]}\nAccount: ${parts[1]}\nBank: ${parts[2]}`);
          return;
        }
      }
      await bot.sendMessage(chatId, '❌ Invalid format. Use:\nNAME | ACCOUNT_NUMBER | BANK_NAME');
      return;
    }
  }

  // Default fallback
  if (!state) {
    await bot.sendMessage(chatId, `👋 Hi ${username}! Use /start to open the shop menu.`);
  }
});

// ── Error handling ──────────────────────────────────────────────────────────

process.on('unhandledRejection', error => { Logger.error(`Unhandled Rejection: ${error.message}`); });
bot.on('polling_error', error => { Logger.error(`Polling error: ${error.message}`); });
process.on('SIGINT', () => { Logger.info('Bot shutting down...'); bot.stopPolling(); process.exit(0); });

Logger.success('🛍️ Shop Bot is running and listening for messages...');
