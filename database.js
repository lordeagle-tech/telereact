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
          channels: config.channels.list,
          bankDetails: {
            accountName: '',
            accountNumber: '',
            bankName: '',
          },
          redeemCodes: {},
          pendingPayments: {},
          settings: {
            botActive: true,
            maintenanceMode: false,
            lastBackup: new Date().toISOString(),
          },
        };
        this.save(defaultDB);
        console.log('✅ Database initialized successfully');
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
      // Create backup if enabled
      if (config.database.backupEnabled) {
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
      const backupData = {
        ...JSON.parse(data),
        backupTime: new Date().toISOString(),
      };
      fs.writeFileSync(
        this.backupPath,
        JSON.stringify(backupData, null, 2),
        'utf8'
      );
    } catch (error) {
      console.warn('⚠️ Backup creation warning:', error.message);
    }
  }

  restoreBackup() {
    try {
      if (fs.existsSync(this.backupPath)) {
        const backupData = fs.readFileSync(this.backupPath, 'utf8');
        fs.writeFileSync(this.filePath, backupData, 'utf8');
        console.log('✅ Database restored from backup');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error restoring backup:', error.message);
      return false;
    }
  }

  // User operations
  getUser(userId) {
    const db = this.getDB();
    if (!db.users[userId]) {
      db.users[userId] = this.createNewUser(userId);
      this.save(db);
    }
    return db.users[userId];
  }

  createNewUser(userId) {
    return {
      id: userId,
      username: 'Unknown',
      chatId: userId,
      points: 0,
      referrals: 0,
      referralCode: this.generateReferralCode(),
      verified: true,
      isPremium: false,
      dailyClaimsToday: 0,
      lastDailyClaim: null,
      viewsUsedToday: 0,
      reactionsUsedToday: 0,
      lastDailyReset: new Date().toDateString(),
      joinedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  updateUser(userId, userData) {
    const db = this.getDB();
    db.users[userId] = {
      ...this.getUser(userId),
      ...userData,
      updatedAt: new Date().toISOString(),
    };
    this.save(db);
    return db.users[userId];
  }

  getAllUsers() {
    return this.getDB().users;
  }

  // Admin operations
  addAdmin(userId) {
    const db = this.getDB();
    if (!db.admins.includes(userId)) {
      db.admins.push(userId);
      this.save(db);
      return true;
    }
    return false;
  }

  removeAdmin(userId) {
    const db = this.getDB();
    db.admins = db.admins.filter(id => id !== userId);
    this.save(db);
    return true;
  }

  isAdmin(userId) {
    return this.getDB().admins.includes(userId);
  }

  getAdmins() {
    return this.getDB().admins;
  }

  // Ban operations
  banUser(userId) {
    const db = this.getDB();
    if (!db.bannedUsers.includes(userId)) {
      db.bannedUsers.push(userId);
      this.save(db);
      return true;
    }
    return false;
  }

  unbanUser(userId) {
    const db = this.getDB();
    db.bannedUsers = db.bannedUsers.filter(id => id !== userId);
    this.save(db);
    return true;
  }

  isBanned(userId) {
    return this.getDB().bannedUsers.includes(userId);
  }

  // Channel operations
  getChannels() {
    return this.getDB().channels;
  }

  addChannel(channelName) {
    const db = this.getDB();
    if (!db.channels.includes(channelName)) {
      db.channels.push(channelName);
      this.save(db);
      return true;
    }
    return false;
  }

  // Bank details operations
  getBankDetails() {
    return this.getDB().bankDetails;
  }

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

  // Redeem code operations
  generateRedeemCode(points, uses) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const db = this.getDB();
    db.redeemCodes[code] = {
      points,
      usesLeft: uses,
      createdAt: new Date().toISOString(),
      createdBy: 'admin',
    };
    this.save(db);
    return code;
  }

  redeemCode(code, userId) {
    const db = this.getDB();
    const codeData = db.redeemCodes[code];

    if (!codeData) {
      return { success: false, message: 'Code not found' };
    }

    if (codeData.usesLeft <= 0) {
      return { success: false, message: 'Code has been used up' };
    }

    codeData.usesLeft--;
    if (codeData.usesLeft === 0) {
      delete db.redeemCodes[code];
    }

    const user = db.users[userId];
    user.points += codeData.points;

    this.save(db);
    return {
      success: true,
      message: `Code redeemed! +${codeData.points} points`,
      points: codeData.points,
    };
  }

  getRedeemCodes() {
    return this.getDB().redeemCodes;
  }

  // Payment operations
  addPendingPayment(paymentId, paymentData) {
    const db = this.getDB();
    db.pendingPayments[paymentId] = {
      ...paymentData,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    this.save(db);
  }

  getPendingPayments() {
    return this.getDB().pendingPayments;
  }

  updatePaymentStatus(paymentId, status) {
    const db = this.getDB();
    if (db.pendingPayments[paymentId]) {
      db.pendingPayments[paymentId].status = status;
      db.pendingPayments[paymentId].updatedAt = new Date().toISOString();
      this.save(db);
      return true;
    }
    return false;
  }

  // Utility methods
  generateReferralCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  resetDailyLimits() {
    const db = this.getDB();
    const today = new Date().toDateString();

    Object.keys(db.users).forEach(userId => {
      const user = db.users[userId];
      if (user.lastDailyReset !== today) {
        user.dailyClaimsToday = 0;
        user.viewsUsedToday = 0;
        user.reactionsUsedToday = 0;
        user.lastDailyReset = today;
      }
    });

    this.save(db);
  }

  getStats() {
    const db = this.getDB();
    return {
      totalUsers: Object.keys(db.users).length,
      premiumUsers: Object.values(db.users).filter(u => u.isPremium).length,
      verifiedUsers: Object.values(db.users).filter(u => u.verified).length,
      bannedUsers: db.bannedUsers.length,
      totalAdmins: db.admins.length,
      totalPoints: Object.values(db.users).reduce((sum, u) => sum + u.points, 0),
    };
  }
}

export const db = new Database();
export default db;