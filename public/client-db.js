/**
 * Client-Side Database using IndexedDB
 * Data disimpan di browser, bukan di server
 * Persistent meskipun Vercel sleep/restart
 */

const DB_NAME = 'ContactCaptureDB';
const DB_VERSION = 1;
const STORE_CONTACTS = 'contacts';
const STORE_CHECKINS = 'daily_checkins';

class ClientDB {
  constructor() {
    this.db = null;
    this.isReady = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        this.isReady = true;
        console.log('✅ IndexedDB initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create contacts store
        if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
          const contactStore = db.createObjectStore(STORE_CONTACTS, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          contactStore.createIndex('name', 'name', { unique: false });
          contactStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Create daily_checkins store
        if (!db.objectStoreNames.contains(STORE_CHECKINS)) {
          const checkinStore = db.createObjectStore(STORE_CHECKINS, { 
            keyPath: 'id', 
            autoIncrement: true 
          });
          checkinStore.createIndex('contact_id', 'contact_id', { unique: false });
          checkinStore.createIndex('checkin_date', 'checkin_date', { unique: false });
          checkinStore.createIndex('contact_date', ['contact_id', 'checkin_date'], { unique: true });
        }
      };
    });
  }

  // ==================== CONTACTS ====================

  async getAllContacts() {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CONTACTS, 'readonly');
      const store = transaction.objectStore(STORE_CONTACTS);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const contacts = request.result.sort((a, b) => 
          new Date(b.created_at) - new Date(a.created_at)
        );
        resolve(contacts);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getContactById(id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CONTACTS, 'readonly');
      const store = transaction.objectStore(STORE_CONTACTS);
      const request = store.get(parseInt(id));
      
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async insertContact({ name, address, phone, notes, image_path, latitude, longitude }) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const contact = {
        name,
        address,
        phone: phone || null,
        notes: notes || null,
        image_path: image_path || null,
        latitude: latitude || null,
        longitude: longitude || null,
        created_at: new Date().toISOString()
      };

      const transaction = this.db.transaction(STORE_CONTACTS, 'readwrite');
      const store = transaction.objectStore(STORE_CONTACTS);
      const request = store.add(contact);
      
      request.onsuccess = () => {
        contact.id = request.result;
        resolve({ id: contact.id, contact });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async updateContact(id, { name, address, phone, notes, latitude, longitude, location_manually_set }) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CONTACTS, 'readwrite');
      const store = transaction.objectStore(STORE_CONTACTS);
      const getRequest = store.get(parseInt(id));
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) return reject(new Error('Contact not found'));

        const updated = {
          ...existing,
          name,
          address,
          phone: phone || null,
          notes: notes || null,
          latitude: latitude !== undefined ? latitude : existing.latitude,
          longitude: longitude !== undefined ? longitude : existing.longitude,
          location_manually_set: location_manually_set !== undefined ? location_manually_set : existing.location_manually_set
        };

        const putRequest = store.put(updated);
        putRequest.onsuccess = () => resolve(updated);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async updateContactLocation(id, latitude, longitude) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CONTACTS, 'readwrite');
      const store = transaction.objectStore(STORE_CONTACTS);
      const getRequest = store.get(parseInt(id));
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        if (!existing) return reject(new Error('Contact not found'));

        existing.latitude = latitude;
        existing.longitude = longitude;
        existing.location_manually_set = true; // Mark as manually updated

        const putRequest = store.put(existing);
        putRequest.onsuccess = () => resolve(existing);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteContact(id) {
    await this.ensureReady();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_CONTACTS, STORE_CHECKINS], 'readwrite');
      
      // Delete contact
      const contactStore = transaction.objectStore(STORE_CONTACTS);
      contactStore.delete(parseInt(id));

      // Delete related checkins
      const checkinStore = transaction.objectStore(STORE_CHECKINS);
      const index = checkinStore.index('contact_id');
      const request = index.openCursor(IDBKeyRange.only(parseInt(id)));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve({ success: true });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async searchContacts(query) {
    const contacts = await this.getAllContacts();
    const q = query.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(q) || 
      (c.address && c.address.toLowerCase().includes(q))
    );
  }

  async findContactByName(name) {
    const contacts = await this.getAllContacts();
    return contacts.find(c => c.name.toLowerCase() === name.toLowerCase()) || null;
  }

  async findSimilarContacts(name) {
    const contacts = await this.getAllContacts();
    const n = name.toLowerCase();
    const firstName = name.split(' ')[0].toLowerCase();
    const lastName = name.split(' ').pop().toLowerCase();
    
    return contacts.filter(c => {
      const cn = c.name.toLowerCase();
      return cn.includes(n) || cn.includes(firstName) || cn.includes(lastName);
    });
  }

  // ==================== DAILY CHECKINS ====================

  getTodayDate() {
    return new Date().toISOString().split('T')[0];
  }

  async checkinContact(contactId, date = null) {
    await this.ensureReady();
    const checkinDate = date || this.getTodayDate();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readwrite');
      const store = transaction.objectStore(STORE_CHECKINS);
      const index = store.index('contact_date');
      
      // Check if already checked in
      const checkRequest = index.get([parseInt(contactId), checkinDate]);
      
      checkRequest.onsuccess = () => {
        if (checkRequest.result) {
          return resolve({ success: true, message: 'Sudah check-in', alreadyCheckedIn: true });
        }

        // Add new checkin
        const addRequest = store.add({
          contact_id: parseInt(contactId),
          checkin_date: checkinDate,
          created_at: new Date().toISOString()
        });

        addRequest.onsuccess = () => resolve({ success: true, message: 'Check-in berhasil', alreadyCheckedIn: false });
        addRequest.onerror = () => reject(addRequest.error);
      };
      checkRequest.onerror = () => reject(checkRequest.error);
    });
  }

  async getDailyCheckins(date = null) {
    await this.ensureReady();
    const checkinDate = date || this.getTodayDate();
    const contacts = await this.getAllContacts();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readonly');
      const store = transaction.objectStore(STORE_CHECKINS);
      const index = store.index('checkin_date');
      const request = index.getAll(checkinDate);
      
      request.onsuccess = () => {
        const checkins = request.result
          .map(checkin => {
            const contact = contacts.find(c => c.id === checkin.contact_id);
            return contact ? { 
              ...contact, 
              checkin_date: checkin.checkin_date, 
              checkin_time: checkin.created_at 
            } : null;
          })
          .filter(Boolean)
          .sort((a, b) => new Date(b.checkin_time) - new Date(a.checkin_time));
        
        resolve(checkins);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getCheckinHistory() {
    await this.ensureReady();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readonly');
      const store = transaction.objectStore(STORE_CHECKINS);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const checkins = request.result;
        const dateMap = {};
        
        checkins.forEach(c => {
          dateMap[c.checkin_date] = (dateMap[c.checkin_date] || 0) + 1;
        });

        const history = Object.entries(dateMap)
          .map(([date, total]) => ({ date, total }))
          .sort((a, b) => b.date.localeCompare(a.date));
        
        resolve(history);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async undoCheckin(contactId, date = null) {
    await this.ensureReady();
    const checkinDate = date || this.getTodayDate();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readwrite');
      const store = transaction.objectStore(STORE_CHECKINS);
      const index = store.index('contact_date');
      const request = index.openCursor(IDBKeyRange.only([parseInt(contactId), checkinDate]));
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve({ success: true, message: 'Check-in dibatalkan' });
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ==================== HELPERS ====================

  async ensureReady() {
    if (!this.isReady) await this.init();
  }

  // Export data to JSON
  async exportData() {
    const contacts = await this.getAllContacts();
    const checkins = await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readonly');
      const store = transaction.objectStore(STORE_CHECKINS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return { contacts, checkins, exported_at: new Date().toISOString() };
  }

  // Import data from JSON
  async importData(data) {
    if (data.contacts) {
      const transaction = this.db.transaction(STORE_CONTACTS, 'readwrite');
      const store = transaction.objectStore(STORE_CONTACTS);
      for (const contact of data.contacts) {
        store.put(contact);
      }
    }
    if (data.checkins) {
      const transaction = this.db.transaction(STORE_CHECKINS, 'readwrite');
      const store = transaction.objectStore(STORE_CHECKINS);
      for (const checkin of data.checkins) {
        store.put(checkin);
      }
    }
    return { success: true, message: 'Data berhasil diimport' };
  }
}

// Create singleton instance
const clientDB = new ClientDB();

// Auto-initialize
clientDB.init().catch(console.error);

// Export for use in app.js
window.ClientDB = clientDB;
