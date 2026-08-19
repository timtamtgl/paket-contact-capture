const IS_VERCEL = !!process.env.VERCEL;

let db = null;
let sqlJsReady = false;
let inMemoryContacts = [];
let inMemoryCheckins = [];
let nextContactId = 1;
let nextCheckinId = 1;

function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

async function initDatabase() {
  if (IS_VERCEL) {
    console.log('⚠️ Vercel mode: in-memory storage');
    return null;
  }

  // Lazy-load sql.js only on local
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const path = require('path');
  const DB_PATH = path.join(__dirname, 'contacts.db');

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

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

  saveDatabase();
  sqlJsReady = true;

  console.log('✅ SQLite file-based storage');
  return db;
}

function saveDatabase() {
  if (db && sqlJsReady && !IS_VERCEL) {
    const fs = require('fs');
    const path = require('path');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(path.join(__dirname, 'contacts.db'), buffer);
  }
}

module.exports = {
  initDatabase,

  getAllContacts() {
    if (IS_VERCEL) {
      return [...inMemoryContacts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    const results = db.exec('SELECT * FROM contacts ORDER BY created_at DESC');
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4],
      image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8]
    }));
  },

  getContactById(id) {
    if (IS_VERCEL) {
      return inMemoryContacts.find(c => c.id === parseInt(id)) || null;
    }
    const results = db.exec('SELECT * FROM contacts WHERE id = ?', [parseInt(id)]);
    if (results.length === 0 || results[0].values.length === 0) return null;
    const row = results[0].values[0];
    return { id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4], image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8] };
  },

  insertContact({ name, address, phone, notes, image_path, latitude, longitude }) {
    if (IS_VERCEL) {
      const contact = {
        id: nextContactId++, name, address,
        phone: phone || null, notes: notes || null,
        image_path: image_path || null,
        latitude: latitude || null, longitude: longitude || null,
        created_at: new Date().toISOString()
      };
      inMemoryContacts.push(contact);
      return { id: contact.id };
    }
    db.run(
      'INSERT INTO contacts (name, address, phone, notes, image_path, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, address, phone || null, notes || null, image_path || null, latitude || null, longitude || null]
    );
    const result = db.exec('SELECT last_insert_rowid() as id');
    const id = result[0].values[0][0];
    saveDatabase();
    return { id };
  },

  updateContact(id, { name, address, phone, notes, latitude, longitude }) {
    if (IS_VERCEL) {
      const idx = inMemoryContacts.findIndex(c => c.id === parseInt(id));
      if (idx !== -1) {
        inMemoryContacts[idx] = { ...inMemoryContacts[idx], name, address, phone, notes, latitude, longitude };
      }
      return;
    }
    db.run(
      'UPDATE contacts SET name = ?, address = ?, phone = ?, notes = ?, latitude = ?, longitude = ? WHERE id = ?',
      [name, address, phone || null, notes || null, latitude || null, longitude || null, parseInt(id)]
    );
    saveDatabase();
  },

  updateContactLocation(id, latitude, longitude) {
    if (IS_VERCEL) {
      const idx = inMemoryContacts.findIndex(c => c.id === parseInt(id));
      if (idx !== -1) { inMemoryContacts[idx].latitude = latitude; inMemoryContacts[idx].longitude = longitude; }
      return;
    }
    db.run('UPDATE contacts SET latitude = ?, longitude = ? WHERE id = ?', [latitude, longitude, parseInt(id)]);
    saveDatabase();
  },

  deleteContact(id) {
    if (IS_VERCEL) {
      inMemoryContacts = inMemoryContacts.filter(c => c.id !== parseInt(id));
      inMemoryCheckins = inMemoryCheckins.filter(c => c.contact_id !== parseInt(id));
      return;
    }
    db.run('DELETE FROM contacts WHERE id = ?', [parseInt(id)]);
    db.run('DELETE FROM daily_checkins WHERE contact_id = ?', [parseInt(id)]);
    saveDatabase();
  },

  searchContacts(query) {
    if (IS_VERCEL) {
      const q = query.toLowerCase();
      return inMemoryContacts.filter(c => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q));
    }
    const results = db.exec('SELECT * FROM contacts WHERE name LIKE ? OR address LIKE ? ORDER BY created_at DESC', [`%${query}%`, `%${query}%`]);
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4],
      image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8]
    }));
  },

  findContactByName(name) {
    if (IS_VERCEL) {
      return inMemoryContacts.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
    }
    const results = db.exec('SELECT * FROM contacts WHERE LOWER(name) = LOWER(?)', [name]);
    if (results.length === 0 || results[0].values.length === 0) return null;
    const row = results[0].values[0];
    return { id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4], image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8] };
  },

  findSimilarContacts(name) {
    if (IS_VERCEL) {
      const n = name.toLowerCase();
      const firstName = name.split(' ')[0].toLowerCase();
      const lastName = name.split(' ').pop().toLowerCase();
      return inMemoryContacts.filter(c => {
        const cn = c.name.toLowerCase();
        return cn.includes(n) || cn.includes(firstName) || cn.includes(lastName);
      });
    }
    const results = db.exec(
      'SELECT * FROM contacts WHERE LOWER(name) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?) ORDER BY created_at DESC',
      [`%${name}%`, `%${name.split(' ')[0]}%`, `%${name.split(' ').pop()}%`]
    );
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4],
      image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8]
    }));
  },

  checkinContact(contactId, date = null) {
    const checkinDate = date || getTodayDate();

    if (IS_VERCEL) {
      const existing = inMemoryCheckins.find(c => c.contact_id === parseInt(contactId) && c.checkin_date === checkinDate);
      if (existing) return { success: true, message: 'Sudah check-in', alreadyCheckedIn: true };
      inMemoryCheckins.push({ id: nextCheckinId++, contact_id: parseInt(contactId), checkin_date: checkinDate, created_at: new Date().toISOString() });
      return { success: true, message: 'Check-in berhasil', alreadyCheckedIn: false };
    }

    const existing = db.exec('SELECT id FROM daily_checkins WHERE contact_id = ? AND checkin_date = ?', [parseInt(contactId), checkinDate]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return { success: true, message: 'Sudah check-in', alreadyCheckedIn: true };
    }
    db.run('INSERT INTO daily_checkins (contact_id, checkin_date) VALUES (?, ?)', [parseInt(contactId), checkinDate]);
    saveDatabase();
    return { success: true, message: 'Check-in berhasil', alreadyCheckedIn: false };
  },

  getDailyCheckins(date = null) {
    const checkinDate = date || getTodayDate();

    if (IS_VERCEL) {
      return inMemoryCheckins
        .filter(c => c.checkin_date === checkinDate)
        .map(c => {
          const contact = inMemoryContacts.find(ct => ct.id === c.contact_id);
          return contact ? { ...contact, checkin_date: c.checkin_date, checkin_time: c.created_at } : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(b.checkin_time) - new Date(a.checkin_time));
    }

    const results = db.exec(
      'SELECT c.*, dc.checkin_date, dc.created_at as checkin_time FROM contacts c INNER JOIN daily_checkins dc ON c.id = dc.contact_id WHERE dc.checkin_date = ? ORDER BY dc.created_at DESC',
      [checkinDate]
    );
    if (results.length === 0) return [];
    return results[0].values.map(row => ({
      id: row[0], name: row[1], address: row[2], phone: row[3], notes: row[4],
      image_path: row[5], latitude: row[6], longitude: row[7], created_at: row[8],
      checkin_date: row[9], checkin_time: row[10]
    }));
  },

  getCheckinHistory() {
    if (IS_VERCEL) {
      const dateMap = {};
      inMemoryCheckins.forEach(c => { dateMap[c.checkin_date] = (dateMap[c.checkin_date] || 0) + 1; });
      return Object.entries(dateMap).map(([date, total]) => ({ date, total })).sort((a, b) => b.date.localeCompare(a.date));
    }
    const results = db.exec('SELECT checkin_date, COUNT(*) as total FROM daily_checkins GROUP BY checkin_date ORDER BY checkin_date DESC');
    if (results.length === 0) return [];
    return results[0].values.map(row => ({ date: row[0], total: row[1] }));
  },

  undoCheckin(contactId, date = null) {
    const checkinDate = date || getTodayDate();
    if (IS_VERCEL) {
      inMemoryCheckins = inMemoryCheckins.filter(c => !(c.contact_id === parseInt(contactId) && c.checkin_date === checkinDate));
      return { success: true, message: 'Check-in dibatalkan' };
    }
    db.run('DELETE FROM daily_checkins WHERE contact_id = ? AND checkin_date = ?', [parseInt(contactId), checkinDate]);
    saveDatabase();
    return { success: true, message: 'Check-in dibatalkan' };
  }
};
