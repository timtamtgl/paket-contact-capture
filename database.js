const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'contacts.db');

let db = null;

// Initialize database
async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create contacts table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT,
      notes TEXT,
      image_path TEXT,
      latitude REAL,
      longitude REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create daily_checkins table for tracking daily visits
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_checkins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      checkin_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      UNIQUE(contact_id, checkin_date)
    )
  `);
  
  // Save database
  saveDatabase();
  
  return db;
}

// Save database to file
function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// Auto-save every 30 seconds
setInterval(() => {
  saveDatabase();
}, 30000);

// Save on process exit
process.on('exit', () => saveDatabase());
process.on('SIGINT', () => { saveDatabase(); process.exit(); });
process.on('SIGTERM', () => { saveDatabase(); process.exit(); });

// Helper function to map rows to contact objects
function mapContact(row) {
  return {
    id: row[0],
    name: row[1],
    address: row[2],
    phone: row[3],
    notes: row[4],
    image_path: row[5],
    latitude: row[6],
    longitude: row[7],
    created_at: row[8]
  };
}

// Helper function to get today's date
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

module.exports = {
  initDatabase,
  
  // ==================== CONTACTS ====================
  
  // Get all contacts
  getAllContacts() {
    const results = db.exec('SELECT * FROM contacts ORDER BY created_at DESC');
    if (results.length === 0) return [];
    return results[0].values.map(mapContact);
  },

  // Get contact by ID
  getContactById(id) {
    const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  // Insert new contact
  insertContact({ name, address, phone, notes, image_path, latitude, longitude }) {
    db.run(
      `INSERT INTO contacts (name, address, phone, notes, image_path, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, address, phone || null, notes || null, image_path || null, latitude || null, longitude || null]
    );
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    return { id };
  },

  // Update contact
  updateContact(id, { name, address, phone, notes, latitude, longitude }) {
    db.run(
      `UPDATE contacts 
       SET name = ?, address = ?, phone = ?, notes = ?, latitude = ?, longitude = ?
       WHERE id = ?`,
      [name, address, phone || null, notes || null, latitude || null, longitude || null, id]
    );
    saveDatabase();
  },

  // Update only location (latitude & longitude)
  updateContactLocation(id, latitude, longitude) {
    db.run(
      `UPDATE contacts 
       SET latitude = ?, longitude = ?
       WHERE id = ?`,
      [latitude, longitude, id]
    );
    saveDatabase();
  },

  // Delete contact
  deleteContact(id) {
    db.run('DELETE FROM contacts WHERE id = ?', [id]);
    saveDatabase();
  },

  // Search contacts
  searchContacts(query) {
    const results = db.exec(
      `SELECT * FROM contacts 
       WHERE name LIKE ? OR address LIKE ? 
       ORDER BY created_at DESC`,
      [`%${query}%`, `%${query}%`]
    );
    
    if (results.length === 0) return [];
    return results[0].values.map(mapContact);
  },

  // Find contact by name (for deduplication)
  findContactByName(name) {
    const stmt = db.prepare('SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)');
    stmt.bind([name]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },

  // Find similar contacts (fuzzy match)
  findSimilarContacts(name) {
    const results = db.exec(
      `SELECT * FROM contacts 
       WHERE LOWER(name) LIKE LOWER(?) 
       OR LOWER(name) LIKE LOWER(?)
       OR LOWER(name) LIKE LOWER(?)
       ORDER BY created_at DESC`,
      [`%${name}%`, `%${name.split(' ')[0]}%`, `%${name.split(' ').pop()}%`]
    );
    
    if (results.length === 0) return [];
    return results[0].values.map(mapContact);
  },

  // ==================== DAILY CHECKINS ====================
  
  // Check in a contact for today (or specific date)
  checkinContact(contactId, date = null) {
    const checkinDate = date || getTodayDate();
    
    // Check if already checked in today
    const existing = db.exec(
      'SELECT id FROM daily_checkins WHERE contact_id = ? AND checkin_date = ?',
      [contactId, checkinDate]
    );
    
    if (existing.length > 0 && existing[0].values.length > 0) {
      return { success: true, message: 'Sudah check-in hari ini', alreadyCheckedIn: true };
    }
    
    db.run(
      'INSERT INTO daily_checkins (contact_id, checkin_date) VALUES (?, ?)',
      [contactId, checkinDate]
    );
    
    saveDatabase();
    return { success: true, message: 'Check-in berhasil', alreadyCheckedIn: false };
  },

  // Get daily checkins for a specific date
  getDailyCheckins(date = null) {
    const checkinDate = date || getTodayDate();
    
    const results = db.exec(
      `SELECT c.*, dc.checkin_date, dc.created_at as checkin_time
       FROM contacts c
       INNER JOIN daily_checkins dc ON c.id = dc.contact_id
       WHERE dc.checkin_date = ?
       ORDER BY dc.created_at DESC`,
      [checkinDate]
    );
    
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      id: row[0],
      name: row[1],
      address: row[2],
      phone: row[3],
      notes: row[4],
      image_path: row[5],
      latitude: row[6],
      longitude: row[7],
      created_at: row[8],
      checkin_date: row[9],
      checkin_time: row[10]
    }));
  },

  // Get checkin history (list of dates with checkins)
  getCheckinHistory() {
    const results = db.exec(
      `SELECT checkin_date, COUNT(*) as total
       FROM daily_checkins
       GROUP BY checkin_date
       ORDER BY checkin_date DESC`
    );
    
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      date: row[0],
      total: row[1]
    }));
  },

  // Check if contact is checked in today
  isCheckedInToday(contactId) {
    const today = getTodayDate();
    const results = db.exec(
      'SELECT id FROM daily_checkins WHERE contact_id = ? AND checkin_date = ?',
      [contactId, today]
    );
    
    return results.length > 0 && results[0].values.length > 0;
  },

  // Undo checkin for today
  undoCheckin(contactId, date = null) {
    const checkinDate = date || getTodayDate();
    db.run(
      'DELETE FROM daily_checkins WHERE contact_id = ? AND checkin_date = ?',
      [contactId, checkinDate]
    );
    saveDatabase();
    return { success: true, message: 'Check-in dibatalkan' };
  }
};
