import { db } from './database.js';
import { Logger } from './utils.js';
import config from './config.js';

export class ProductHandler {
  static getAllByCategory(category) { return db.getProductsByCategory(category); }
  static getProduct(productId) { return db.getProduct(productId); }

  static addProduct(productData) {
    const product = db.addProduct(productData);
    Logger.success(`Product added: ${product.name}`);
    return product;
  }

  static toggleAvailability(productId) {
    const product = db.getProduct(productId);
    if (!product) return null;
    return db.updateProduct(productId, { available: !product.available });
  }

  static deleteProduct(productId) { return db.deleteProduct(productId); }
}

export class OrderHandler {
  static createOrder({ userId, username, chatId, productId, productName, price, quantity }) {
    const total = Number(price) * quantity;
    const order = db.createOrder({ userId, username, chatId, productId, productName, price: Number(price), quantity, total });
    Logger.info(`Order created: ${order.id} by @${username}`);
    return order;
  }

  static getUserOrders(userId) { return db.getUserOrders(userId); }
  static getPendingOrders() { return db.getOrdersByStatus('pending'); }
  static getAllOrders() {
    return Object.values(db.getAllOrders()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  static confirmOrder(orderId) { return db.updateOrderStatus(orderId, 'confirmed'); }
  static cancelOrder(orderId) { return db.updateOrderStatus(orderId, 'cancelled'); }
  static deliverOrder(orderId) { return db.updateOrderStatus(orderId, 'delivered'); }
}

export class AdminHandler {
  static addAdmin(userId) {
    if (db.addAdmin(userId)) { Logger.success(`Admin added: ${userId}`); return true; }
    return false;
  }

  static removeAdmin(userId) {
    if (db.removeAdmin(userId)) { Logger.success(`Admin removed: ${userId}`); return true; }
    return false;
  }

  static banUser(userId) {
    if (db.banUser(userId)) { Logger.success(`User banned: ${userId}`); return true; }
    return false;
  }

  static unbanUser(userId) {
    if (db.unbanUser(userId)) { Logger.success(`User unbanned: ${userId}`); return true; }
    return false;
  }

  static getSystemStats() { return db.getStats(); }
  static getUsers(limit = 50) { return Object.values(db.getAllUsers()).slice(0, limit); }

  static updateBankDetails(accountName, accountNumber, bankName) {
    db.updateBankDetails({ accountName, accountNumber, bankName });
    Logger.success('Bank details updated');
    return true;
  }
}

export default { ProductHandler, OrderHandler, AdminHandler };
