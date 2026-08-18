const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./database');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// NVIDIA API Client
const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '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',
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Create uploads directory if not exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Hanya file gambar yang diizinkan (jpg, png, gif, webp)'));
  }
});

// ==================== CONTACTS API ====================

// GET - Get all contacts
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = db.getAllContacts();
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Get contact by ID
app.get('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Create new contact (with deduplication check)
app.post('/api/contacts', upload.single('image'), (req, res) => {
  try {
    const { name, address, phone, notes, latitude, longitude } = req.body;
    
    if (!name || !address) {
      return res.status(400).json({ success: false, error: 'Nama dan alamat harus diisi' });
    }

    // Check if contact already exists (deduplication)
    const existingContact = db.findContactByName(name);
    if (existingContact) {
      // Contact already exists, just check in for today
      const checkinResult = db.checkinContact(existingContact.id);
      return res.json({ 
        success: true, 
        data: { 
          id: existingContact.id, 
          message: 'Kontak sudah ada, sudah di-check-in untuk hari ini',
          existing: true,
          checkin: checkinResult
        } 
      });
    }

    const imageData = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Insert new contact
    const result = db.insertContact({
      name,
      address,
      phone,
      notes,
      image_path: imageData,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null
    });

    // Auto check-in for today
    db.checkinContact(result.id);

    res.json({ 
      success: true, 
      data: { 
        id: result.id, 
        message: 'Kontak baru berhasil disimpan dan di-check-in',
        existing: false
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Update contact
app.put('/api/contacts/:id', upload.single('image'), (req, res) => {
  try {
    const { name, address, phone, notes, latitude, longitude } = req.body;
    
    if (!name || !address) {
      return res.status(400).json({ success: false, error: 'Nama dan alamat harus diisi' });
    }

    db.updateContact(req.params.id, {
      name,
      address,
      phone,
      notes,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null
    });

    res.json({ success: true, message: 'Kontak berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Delete contact
app.delete('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.getContactById(req.params.id);
    if (contact && contact.image_path) {
      const imagePath = path.join(__dirname, contact.image_path);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    db.deleteContact(req.params.id);
    res.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Search contacts
app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json({ success: true, data: db.getAllContacts() });
    }
    const contacts = db.searchContacts(q);
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Find similar contacts (for deduplication)
app.get('/api/check-duplicate', (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.json({ success: true, data: [] });
    }
    const similar = db.findSimilarContacts(name);
    res.json({ success: true, data: similar });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Upload image for OCR processing
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diupload' });
    }
    res.json({
      success: true,
      data: {
        image_url: `/uploads/${req.file.filename}`,
        filename: req.file.filename
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LLM OCR API ====================

// POST - Process image with LLM (NVIDIA Vision API)
app.post('/api/llm-ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Tidak ada file yang diupload' });
    }

    const imagePath = path.join(__dirname, 'uploads', req.file.filename);
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype;
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    console.log('📸 Mengirim gambar ke LLM...');

    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-nano-12b-v2-vl',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analisis gambar ini dan ekstrak informasi berikut:
1. Nama (jika ada nama/judul)
2. Alamat lengkap (jika ada alamat)
3. Nomor telepon (jika ada)
4. Catatan tambahan (jika ada)

Format output HANYA dalam JSON seperti ini:
{
  "name": "nama yang ditemukan atau string kosong",
  "address": "alamat lengkap atau string kosong",
  "phone": "nomor telepon atau string kosong",
  "notes": "catatan tambahan atau string kosong"
}

Jika tidak ada informasi yang ditemukan, gunakan string kosong untuk field tersebut.`
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl }
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 1024,
      stream: false
    });

    const response = completion.choices[0].message.content;
    console.log('🤖 LLM Response:', response);

    // Try to parse JSON from response
    let parsedData = { name: '', address: '', phone: '', notes: '' };
    try {
      // Find JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      // If JSON parsing fails, use the raw response as notes
      parsedData.notes = response;
    }

    res.json({
      success: true,
      data: {
        name: parsedData.name || '',
        address: parsedData.address || '',
        phone: parsedData.phone || '',
        notes: parsedData.notes || '',
        raw_response: response,
        image_url: `/uploads/${req.file.filename}`
      }
    });

  } catch (error) {
    console.error('LLM OCR Error:', error);
    res.status(500).json({ success: false, error: 'Gagal memproses gambar dengan LLM: ' + error.message });
  }
});

// ==================== DAILY CHECKINS API ====================

// GET - Get daily checkins (today or specific date)
app.get('/api/daily', (req, res) => {
  try {
    const { date } = req.query;
    const checkins = db.getDailyCheckins(date);
    res.json({ success: true, data: checkins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Get checkin history
app.get('/api/daily/history', (req, res) => {
  try {
    const history = db.getCheckinHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Checkin a contact for today
app.post('/api/daily/checkin', (req, res) => {
  try {
    const { contact_id, date } = req.body;
    
    if (!contact_id) {
      return res.status(400).json({ success: false, error: 'contact_id harus diisi' });
    }

    // Check if contact exists
    const contact = db.getContactById(contact_id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    }

    const result = db.checkinContact(contact_id, date);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Undo checkin
app.delete('/api/daily/checkin', (req, res) => {
  try {
    const { contact_id, date } = req.body;
    
    if (!contact_id) {
      return res.status(400).json({ success: false, error: 'contact_id harus diisi' });
    }

    const result = db.undoCheckin(contact_id, date);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LOCATION UPDATE API ====================

// PUT - Update only location (latitude & longitude)
app.put('/api/contacts/:id/location', (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ success: false, error: 'latitude dan longitude harus diisi' });
    }

    const contact = db.getContactById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    }

    db.updateContactLocation(req.params.id, parseFloat(latitude), parseFloat(longitude));
    res.json({ success: true, message: 'Lokasi berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Redirect /app to /app.html
app.get('/app', (req, res) => {
  res.redirect('/app.html');
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server with database initialization
async function startServer() {
  try {
    console.log('🔧 Menginisialisasi database...');
    await db.initDatabase();
    console.log('✅ Database berhasil diinisialisasi');
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Server berjalan di http://localhost:${PORT}`);
      console.log(`📱 Buka di HP untuk akses kamera\n`);
    });
  } catch (error) {
    console.error('❌ Gagal menginisialisasi database:', error);
    process.exit(1);
  }
}

startServer();
