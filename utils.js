import config from './config.js';

export class Logger {
  static info(message) { console.log(`ℹ️  [${new Date().toISOString()}] ${message}`); }
  static success(message) { console.log(`✅ [${new Date().toISOString()}] ${message}`); }
  static warn(message) { console.warn(`⚠️  [${new Date().toISOString()}] ${message}`); }
  static error(message) { console.error(`❌ [${new Date().toISOString()}] ${message}`); }
}

export class MessageFormatter {
  static shopBanner(subtitle = '') {
    return `🛍️ ${config.shop.name}\n${'─'.repeat(26)}\n${subtitle}`;
  }

  static mainMenu(username) {
    return `${this.shopBanner('WELCOME')}\n\n👋 Hello, ${username}!\n\nBrowse our store and place orders right here on Telegram.\n\nWhat would you like to do?`;
  }

  static categoryMenu() {
    return `🛍️ SHOP CATEGORIES\n\nChoose a category to browse:`;
  }

  static productList(categoryName, products) {
    if (products.length === 0) {
      return `${categoryName}\n\n⚠️ No products available yet in this category.\nCheck back soon!`;
    }
    const list = products
      .map((p, i) => `${i + 1}. ${p.name} — ${config.shop.currencySymbol}${Number(p.price).toFixed(2)}`)
      .join('\n');
    return `${categoryName}\n\n${list}\n\nTap a product to see details:`;
  }

  static productDetail(product) {
    const stock =
      product.stock === -1
        ? '✅ In Stock'
        : product.stock > 0
        ? `✅ ${product.stock} available`
        : '❌ Out of Stock';
    return `📦 ${product.name}\n\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n\n📋 ${product.description}\n\n${stock}`;
  }

  static orderSummary(product, quantity, bankDetails) {
    const total = (Number(product.price) * quantity).toFixed(2);
    let text = `🧾 ORDER SUMMARY\n${'─'.repeat(26)}\n📦 ${product.name}\n💰 Price: ${config.shop.currencySymbol}${Number(product.price).toFixed(2)}\n🔢 Quantity: ${quantity}\n💵 Total: ${config.shop.currencySymbol}${total}\n${'─'.repeat(26)}\n`;
    if (bankDetails && (bankDetails.accountName || bankDetails.accountNumber)) {
      text += `\n🏦 PAYMENT DETAILS\n`;
      if (bankDetails.bankName) text += `Bank: ${bankDetails.bankName}\n`;
      if (bankDetails.accountName) text += `Name: ${bankDetails.accountName}\n`;
      if (bankDetails.accountNumber) text += `Account: ${bankDetails.accountNumber}\n`;
      text += `Amount to send: ${config.shop.currencySymbol}${total}\n`;
    } else {
      text += `\n⚠️ Payment info not configured yet. Admin will contact you.\n`;
    }
    text += `\n📸 After paying, send a screenshot of your payment receipt here to confirm your order.`;
    return text;
  }

  static orderStatusLabel(status) {
    return (
      { pending: '⏳ Pending', confirmed: '✅ Confirmed', delivered: '🚚 Delivered', cancelled: '❌ Cancelled' }[
        status
      ] || status
    );
  }

  static orderDetail(order) {
    return `📋 ORDER #${order.id.slice(-6).toUpperCase()}\n${'─'.repeat(26)}\n📦 Product: ${order.productName}\n🔢 Qty: ${order.quantity}\n💵 Total: ${config.shop.currencySymbol}${Number(order.total).toFixed(2)}\n📊 Status: ${this.orderStatusLabel(order.status)}\n📅 Date: ${new Date(order.createdAt).toLocaleDateString()}`;
  }

  static adminMenu() {
    return `⚙️ ADMIN PANEL\n${'─'.repeat(26)}\nManage your store:`;
  }
}

export class TimeHelper {
  static getTodayString() { return new Date().toDateString(); }
  static formatDate(dateStr) { return new Date(dateStr).toLocaleString(); }
}

export class ValidationHelper {
  static isValidPrice(price) {
    const p = parseFloat(price);
    return !isNaN(p) && p > 0;
  }
  static isValidQuantity(qty) {
    const q = parseInt(qty);
    return !isNaN(q) && q > 0;
  }
  static isValidStock(stock) {
    const s = parseInt(stock);
    return !isNaN(s) && s >= -1;
  }
  static isValidBankDetails(accountName, accountNumber, bankName) {
    return accountName?.trim() && accountNumber?.trim() && bankName?.trim();
  }
}

export default { Logger, MessageFormatter, TimeHelper, ValidationHelper };
