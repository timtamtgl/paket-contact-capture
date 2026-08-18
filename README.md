# 📸 Contact Capture - Pencatat Nama & Alamat dari Foto

Sistem pencatat kontak yang menggunakan kamera HP untuk mengambil foto, lalu menggunakan AI (OCR) untuk membaca nama dan alamat yang tercantum. Data tersimpan di database SQLite dan alamat bisa dibuka langsung di Google Maps.

## 🚀 Fitur Utama

- **📷 Kamera HP** - Akses langsung dari browser HP tanpa perlu install app
- **🤖 AI OCR** - Membaca teks dari gambar menggunakan Tesseract.js (Indonesia + English)
- **💾 Database SQLite** - Menyimpan data kontak secara lokal
- **🗺️ Google Maps** - Klik link alamat untuk buka Google Maps langsung
- **🔍 Pencarian** - Cari kontak berdasarkan nama atau alamat

## 📋 Persyaratan

- Node.js v14 atau lebih tinggi
- Browser modern (Chrome, Firefox, Safari)

## 🔧 Instalasi

```bash
# Clone atau download project ini
cd contact-capture

# Install dependencies
npm install

# Jalankan server
npm start
```

## 💻 Penggunaan

1. **Buka browser** di komputer: `http://localhost:3000`
2. **Buka di HP**: Pastikan HP dan komputer satu jaringan, lalu buka `http://[IP_KOMPUTER]:3000`

### Ambil Foto dari Kamera:
1. Klik tab **📷 Ambil Foto**
2. Klik **🎥 Mulai Kamera**
3. Arahkan kamera ke kartu nama/dokumen
4. Klik **📸 Ambil Foto**
5. Tunggu OCR membaca teks
6. Periksa dan edit data jika perlu
7. Klik **💾 Simpan Kontak**

### Upload Foto:
1. Klik **📁 Upload Foto**
2. Pilih foto dari galeri
3. Tunggu OCR membaca teks
4. Simpan kontak

### Buka di Google Maps:
1. Buka tab **📋 Daftar Kontak**
2. Klik **🗺️ Buka di Maps** pada kontak yang diinginkan
3. Google Maps akan terbuka dengan lokasi tersebut

## 📁 Struktur Project

```
contact-capture/
├── server.js          # Express server & API
├── database.js        # SQLite database module
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Halaman utama
│   ├── style.css      # Styles
│   └── app.js         # Frontend JavaScript
├── uploads/           # Folder untuk foto yang diupload
└── contacts.db        # Database SQLite
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | Ambil semua kontak |
| GET | `/api/contacts/:id` | Ambil kontak by ID |
| POST | `/api/contacts` | Simpan kontak baru |
| PUT | `/api/contacts/:id` | Update kontak |
| DELETE | `/api/contacts/:id` | Hapus kontak |
| GET | `/api/search?q=query` | Cari kontak |

## 🤖 Teknologi yang Digunakan

- **Backend**: Express.js, sql.js (SQLite), Multer (file upload)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **OCR**: Tesseract.js (bahasa Indonesia + English)
- **Database**: SQLite

## 📱 Tips Penggunaan di HP

1. **Tambahkan ke Home Screen** untuk pengalaman seperti app
2. **Izinkan akses kamera** saat diminta
3. **Pastikan pencahayaan cukup** saat foto
4. **Arahkan lurus** ke dokumen untuk hasil terbaik

## 🔄 Pengembangan Selanjutnya

- [ ] Integrasi dengan AI Vision API (Google Cloud Vision, OpenAI) untuk akurasi lebih tinggi
- [ ] Geocoding otomatis dari alamat text
- [ ] Export ke CSV/VCF
- [ ] Kategori kontak
- [ ] Backup/Restore database
- [ ] Multi-user dengan autentikasi

---

Made with ❤️
