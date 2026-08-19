const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./database');
const OpenAI = require('openai');

const app = express();
const IS_VERCEL = !!process.env.VERCEL;

// NVIDIA API Client
const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY || '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',
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - only serve locally
if (!IS_VERCEL) {
  app.use(express.static('public'));
  app.use('/uploads', express.static('uploads'));
  
  // Create uploads directory if not exists
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

// Configure multer - memory storage for Vercel, disk for local
const upload = IS_VERCEL 
  ? multer({ 
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Hanya file gambar yang diizinkan'));
      }
    })
  : multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, 'uploads/'),
        filename: (req, file, cb) => {
          cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
        }
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) return cb(null, true);
        cb(new Error('Hanya file gambar yang diizinkan'));
      }
    });

// Helper: convert file to base64
function fileToBase64(file) {
  if (IS_VERCEL && file.buffer) {
    return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
  }
  // Local: read from disk
  const imagePath = path.join(__dirname, 'uploads', file.filename);
  const imageBuffer = fs.readFileSync(imagePath);
  return `data:${file.mimetype};base64,${imageBuffer.toString('base64')}`;
}

// ==================== CONTACTS API ====================

app.get('/api/contacts', (req, res) => {
  try {
    const contacts = db.getAllContacts();
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/contacts', upload.single('image'), (req, res) => {
  try {
    const { name, address, phone, notes, latitude, longitude } = req.body;
    if (!name || !address) return res.status(400).json({ success: false, error: 'Nama dan alamat harus diisi' });

    const existingContact = db.findContactByName(name);
    if (existingContact) {
      const checkinResult = db.checkinContact(existingContact.id);
      return res.json({ success: true, data: { id: existingContact.id, message: 'Kontak sudah ada, sudah di-check-in', existing: true, checkin: checkinResult } });
    }

    const imageData = IS_VERCEL 
      ? (req.file ? `/api/image/${Date.now()}` : null) 
      : (req.file ? `/uploads/${req.file.filename}` : null);
    
    const result = db.insertContact({
      name, address, phone, notes, image_path: imageData,
      latitude: latitude ? parseFloat(latitude.toString().replace(',', '.')) : null,
      longitude: longitude ? parseFloat(longitude.toString().replace(',', '.')) : null
    });

    db.checkinContact(result.id);
    res.json({ success: true, data: { id: result.id, message: 'Kontak baru berhasil disimpan dan di-check-in', existing: false } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/contacts/:id', upload.single('image'), (req, res) => {
  try {
    const { name, address, phone, notes, latitude, longitude } = req.body;
    if (!name || !address) return res.status(400).json({ success: false, error: 'Nama dan alamat harus diisi' });
    db.updateContact(req.params.id, {
      name, address, phone, notes,
      latitude: latitude ? parseFloat(latitude.toString().replace(',', '.')) : null,
      longitude: longitude ? parseFloat(longitude.toString().replace(',', '.')) : null
    });
    res.json({ success: true, message: 'Kontak berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.getContactById(req.params.id);
    if (contact && contact.image_path && !IS_VERCEL) {
      const imagePath = path.join(__dirname, contact.image_path);
      if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
    }
    db.deleteContact(req.params.id);
    res.json({ success: true, message: 'Kontak berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/search', (req, res) => {
  try {
    const { q } = req.query;
    const contacts = q ? db.searchContacts(q) : db.getAllContacts();
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/check-duplicate', (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.json({ success: true, data: [] });
    const similar = db.findSimilarContacts(name);
    res.json({ success: true, data: similar });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Tidak ada file yang diupload' });
    res.json({ success: true, data: { image_url: IS_VERCEL ? `/api/image/${Date.now()}` : `/uploads/${req.file.filename}`, filename: req.file.filename || 'image' } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LLM OCR API ====================

app.post('/api/llm-ocr', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Tidak ada file yang diupload' });

    const dataUrl = fileToBase64(req.file);

    console.log('📸 Mengirim gambar ke LLM Vision...');

    const invoke_url = "https://integrate.api.nvidia.com/v1/chat/completions";
    const payload = {
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analisis gambar label pengiriman/paket ini. Ekstrak informasi penerima secara akurat.
Perhatikan struktur kolom. Abaikan data "Pengirim" (Sender). Fokus pada "Penerima" (Recipient).

1. Nama: Cari nama di bawah kata "Penerima"
2. Alamat lengkap: Gabungkan semua baris alamat penerima (termasuk Catatan Alamat) menjadi satu teks utuh.
3. Nomor telepon: Cari nomor telepon penerima (biasanya ada tanda *** atau nomor lengkap).
4. Catatan tambahan: instruksi pengiriman (misal: fragile, dll) atau catatan lain.

Format output HANYA dalam JSON tanpa teks tambahan di luar JSON:
{
  "name": "nama penerima",
  "address": "alamat penerima lengkap",
  "phone": "nomor telepon",
  "notes": "catatan tambahan"
}`
          },
          { type: "image_url", image_url: { url: dataUrl } }
        ]
      }],
      model: "meta/llama-3.2-11b-vision-instruct",
      max_tokens: 1024,
      stream: false,
      temperature: 0.1
    };

    const apiResponse = await fetch(invoke_url, {
      method: 'POST',
      headers: {
        "Authorization": "Bearer " + (process.env.NVIDIA_API_KEY || "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"),
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      throw new Error(`API Error ${apiResponse.status}: ${errText}`);
    }

    const completion = await apiResponse.json();
    const response = completion.choices[0].message.content;
    console.log('🤖 LLM Vision Response:', response);

    let parsedData = { name: '', address: '', phone: '', notes: '' };
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      parsedData.notes = response;
    }

    res.json({
      success: true,
      data: {
        name: parsedData.name || '', address: parsedData.address || '',
        phone: parsedData.phone || '', notes: parsedData.notes || '',
        raw_response: response
      }
    });

  } catch (error) {
    console.error('LLM OCR Error:', error);
    res.status(500).json({ success: false, error: 'Gagal memproses gambar dengan LLM: ' + error.message });
  }
});

// ==================== DAILY CHECKINS API ====================

app.get('/api/daily', (req, res) => {
  try {
    const checkins = db.getDailyCheckins(req.query.date);
    res.json({ success: true, data: checkins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/daily/history', (req, res) => {
  try {
    const history = db.getCheckinHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/daily/checkin', (req, res) => {
  try {
    const { contact_id, date } = req.body;
    if (!contact_id) return res.status(400).json({ success: false, error: 'contact_id harus diisi' });
    const contact = db.getContactById(contact_id);
    if (!contact) return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    const result = db.checkinContact(contact_id, date);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/daily/checkin', (req, res) => {
  try {
    const { contact_id, date } = req.body;
    if (!contact_id) return res.status(400).json({ success: false, error: 'contact_id harus diisi' });
    const result = db.undoCheckin(contact_id, date);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LOCATION UPDATE API ====================

app.put('/api/contacts/:id/location', (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) return res.status(400).json({ success: false, error: 'latitude dan longitude harus diisi' });
    const contact = db.getContactById(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Kontak tidak ditemukan' });
    db.updateContactLocation(req.params.id, parseFloat(latitude), parseFloat(longitude));
    res.json({ success: true, message: 'Lokasi berhasil diperbarui' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Redirect /app to /app.html
app.get('/app', (req, res) => { res.redirect('/app.html'); });

// Serve index.html for all other routes (local only)
if (!IS_VERCEL) {
  app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
}

// ==================== SERVER START ====================

async function startServer() {
  try {
    console.log('🔧 Menginisialisasi database...');
    await db.initDatabase();
    console.log('✅ Database berhasil diinisialisasi');
    
    if (!IS_VERCEL) {
      const PORT = process.env.PORT || 3000;
      app.listen(PORT, () => {
        console.log(`\n🚀 Server berjalan di http://localhost:${PORT}`);
        console.log(`📱 Buka di HP untuk akses kamera\n`);
      });
    }
  } catch (error) {
    console.error('❌ Gagal memulai server:', error);
    process.exit(1);
  }
}

startServer();

// Export for Vercel serverless
module.exports = app;
