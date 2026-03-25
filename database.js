import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class Database {
  constructor() {
    this.filePath = config.database.file;
    this.backupPath = this.filePath.replace('.json', '.backup.json');
    this.initializeDB();
  }

  initializeDB() {
    try {
      if (!fs.existsSync(this.filePath)) {
        const defaultDB = {
          users: {},
          admins: [config.admin.userId].filter(Boolean),
          bannedUsers: [],
          bankDetails: { accountName: '', accountNumber: '', bankName: '' },
          products: {},
          orders: {},
          settings: { botActive: true, lastBackup: new Date().toISOString() },
        };
        this.save(defaultDB);
        console.log('✅ Database initialized successfully');
      } else {
        // Migrate: ensure new fields exist
        const existing = this.getDB();
        let changed = false;
        if (!existing.products) { existing.products = {}; changed = true; }
        if (!existing.orders) { existing.orders = {}; changed = true; }
        if (!existing.bankDetails) { existing.bankDetails = { accountName: '', accountNumber: '', bankName: '' }; changed = true; }
        if (changed) {
          this.save(existing);
          console.log('✅ Database migrated to shop schema');
        }
      }
    } catch (error) {
      console.error('❌ Database initialization error:', error.message);
      throw error;
    }
  }

  getDB() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ Error reading database:', error.message);
      throw error;
    }
  }

  save(data) {
    try {
      if (config.database.backupEnabled && fs.existsSync(this.filePath)) {
        this.createBackup();
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error('❌ Error saving database:', error.message);
      throw error;
    }
  }

  createBackup() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      fs.writeFileSync(this.backupPath, data, 'utf8');
    } catch (error) {
      console.warn('⚠️ Backup warning:', error.message);
    }
  }

  // ── User operations ──────────────────────────────────────────────
  getUser(userId) {
    const db = this.getDB();
    if (!db.users[userId]) {
      db.users[userId] = this._newUser(userId);
      this.save(db);
    }
    return db.users[userId];
  }

  _newUser(userId) {
    return {
      id: userId,
      username: 'Unknown',
      chatId: userId,
      verified: true,
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  updateUser(userId, userData) {
    const db = this.getDB();
    db.users[userId] = { ...this.getUser(userId), ...userData, updatedAt: new Date().toISOString() };
    this.save(db);
    return db.users[userId];
  }

  getAllUsers() { return this.getDB().users; }

  // ── Admin operations ─────────────────────────────────────────────
  isAdmin(userId) {
    const db = this.getDB();
    const id = String(userId);
    return db.admins.some(a => String(a) === id);
  }

  addAdmin(userId) {
    const db = this.getDB();
    const id = String(userId);
    if (!db.admins.some(a => String(a) === id)) {
      db.admins.push(id);
      this.save(db);
      return true;
    }
    return false;
  }

  removeAdmin(userId) {
    const db = this.getDB();
    db.admins = db.admins.filter(a => String(a) !== String(userId));
    this.save(db);
    return true;
  }

  getAdmins() { return this.getDB().admins; }

  // ── Ban operations ───────────────────────────────────────────────
  isBanned(userId) {
    return this.getDB().bannedUsers.some(id => String(id) === String(userId));
  }

  banUser(userId) {
    const db = this.getDB();
    const id = String(userId);
    if (!db.bannedUsers.some(x => String(x) === id)) {
      db.bannedUsers.push(id);
      this.save(db);
      return true;
    }
    return false;
  }

  unbanUser(userId) {
    const db = this.getDB();
    db.bannedUsers = db.bannedUsers.filter(x => String(x) !== String(userId));
    this.save(db);
    return true;
  }

  // ── Bank details ─────────────────────────────────────────────────
  getBankDetails() { return this.getDB().bankDetails || {}; }

  updateBankDetails(details) {
    const db = this.getDB();
    db.bankDetails = {
      accountName: details.accountName || '',
      accountNumber: details.accountNumber || '',
      bankName: details.bankName || '',
    };
    this.save(db);
    return db.bankDetails;
  }

  // ── Product operations ───────────────────────────────────────────
  addProduct(product) {
    const db = this.getDB();
    const id = 'prod_' + Date.now();
    db.products[id] = { id, ...product, available: true, createdAt: new Date().toISOString() };
    this.save(db);
    return db.products[id];
  }

  updateProduct(productId, updates) {
    const db = this.getDB();
    if (!db.products[productId]) return null;
    db.products[productId] = { ...db.products[productId], ...updates, updatedAt: new Date().toISOString() };
    this.save(db);
    return db.products[productId];
  }

  deleteProduct(productId) {
    const db = this.getDB();
    if (!db.products[productId]) return false;
    delete db.products[productId];
    this.save(db);
    return true;
  }

  getProduct(productId) { return this.getDB().products[productId] || null; }
  getAllProducts() { return this.getDB().products; }

  getProductsByCategory(category) {
    return Object.values(this.getDB().products).filter(p => p.category === category && p.available);
  }

  // ── Order operations ─────────────────────────────────────────────
  createOrder(data) {
    const db = this.getDB();
    const id = 'ord_' + Date.now();
    db.orders[id] = { id, ...data, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    this.save(db);
    return db.orders[id];
  }

  getOrder(orderId) { return this.getDB().orders[orderId] || null; }
  getAllOrders() { return this.getDB().orders; }

  getOrdersByStatus(status) {
    return Object.values(this.getDB().orders).filter(o => o.status === status);
  }

  getUserOrders(userId) {
    return Object.values(this.getDB().orders)
      .filter(o => String(o.userId) === String(userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  updateOrderStatus(orderId, status) {
    const db = this.getDB();
    if (!db.orders[orderId]) return null;
    db.orders[orderId].status = status;
    db.orders[orderId].updatedAt = new Date().toISOString();
    this.save(db);
    return db.orders[orderId];
  }

  getStats() {
    const db = this.getDB();
    const orders = Object.values(db.orders || {});
    return {
      totalUsers: Object.keys(db.users).length,
      totalProducts: Object.keys(db.products || {}).length,
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === 'pending').length,
      confirmedOrders: orders.filter(o => o.status === 'confirmed').length,
      deliveredOrders: orders.filter(o => o.status === 'delivered').length,
      totalRevenue: orders
        .filter(o => o.status === 'confirmed' || o.status === 'delivered')
        .reduce((sum, o) => sum + Number(o.total), 0),
      totalAdmins: db.admins.length,
      bannedUsers: db.bannedUsers.length,
    };
  }
}

export const db = new Database();
export default db;
