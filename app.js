// Global variables
let currentImageFile = null;
let currentImageDataUrl = null;
let cameraStream = null;
let recognizedText = '';
let existingContactId = null;

// DOM Elements
const cameraPreview = document.getElementById('cameraPreview');
const cameraCanvas = document.getElementById('cameraCanvas');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const stopCameraBtn = document.getElementById('stopCamera');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const clearImageBtn = document.getElementById('clearImage');
const ocrResult = document.getElementById('ocrResult');
const ocrStatus = document.getElementById('ocrStatus');
const duplicateWarning = document.getElementById('duplicateWarning');
const similarContacts = document.getElementById('similarContacts');
const useExistingBtn = document.getElementById('useExistingBtn');
const addNewBtn = document.getElementById('addNewBtn');
const contactForm = document.getElementById('contactForm');
const dailyList = document.getElementById('dailyList');
const dailyCount = document.getElementById('dailyCount');
const allContactsList = document.getElementById('allContactsList');
const historyList = document.getElementById('historyList');
const searchInput = document.getElementById('searchInput');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const todayDateEl = document.getElementById('todayDate');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// ==================== TAB NAVIGATION ====================
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    
    tab.classList.add('active');
    const targetTab = document.getElementById(tab.dataset.tab);
    targetTab.classList.add('active');
    
    // Load data based on tab
    if (tab.dataset.tab === 'daily') {
      loadDailyCheckins();
    } else if (tab.dataset.tab === 'contacts') {
      loadAllContacts();
    } else if (tab.dataset.tab === 'history') {
      loadHistory();
    }
  });
});

// ==================== DATE DISPLAY ====================
function updateDateDisplay() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  todayDateEl.textContent = now.toLocaleDateString('id-ID', options);
}

// ==================== IMAGE COMPRESSION ====================
async function compressImage(fileOrBlob) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Max dimension 800px
        const MAX_SIZE = 800;
        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Export as low quality JPEG
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        fetch(dataUrl)
          .then(res => res.blob())
          .then(blob => {
            resolve({
              file: new File([blob], 'compressed.jpg', { type: 'image/jpeg' }),
              dataUrl: dataUrl
            });
          });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fileOrBlob);
  });
}

// ==================== CAMERA FUNCTIONS ====================
startCameraBtn.addEventListener('click', async () => {
  try {
    const constraints = {
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraPreview.srcObject = cameraStream;
    
    startCameraBtn.style.display = 'none';
    captureBtn.style.display = 'inline-flex';
    stopCameraBtn.style.display = 'inline-flex';
    
  } catch (error) {
    console.error('Error accessing camera:', error);
    alert('Tidak dapat mengakses kamera. Pastikan izin kamera diberikan.');
  }
});

captureBtn.addEventListener('click', () => {
  const context = cameraCanvas.getContext('2d');
  cameraCanvas.width = cameraPreview.videoWidth;
  cameraCanvas.height = cameraPreview.videoHeight;
  context.drawImage(cameraPreview, 0, 0);
  
  const rawDataUrl = cameraCanvas.toDataURL('image/jpeg', 0.9);
  fetch(rawDataUrl)
    .then(res => res.blob())
    .then(async blob => {
      const compressed = await compressImage(blob);
      currentImageFile = compressed.file;
      currentImageDataUrl = compressed.dataUrl;
      previewImg.src = currentImageDataUrl;
      imagePreview.style.display = 'block';
      processImage();
    });
});

stopCameraBtn.addEventListener('click', () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraPreview.srcObject = null;
  
  startCameraBtn.style.display = 'inline-flex';
  captureBtn.style.display = 'none';
  stopCameraBtn.style.display = 'none';
});

// ==================== FILE UPLOAD ====================
uploadBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    showLoading(true, 'Mengompresi gambar...');
    const compressed = await compressImage(file);
    currentImageFile = compressed.file;
    currentImageDataUrl = compressed.dataUrl;
    previewImg.src = currentImageDataUrl;
    imagePreview.style.display = 'block';
    processImage();
    showLoading(false);
  }
});

// ==================== LLM OCR ====================
document.getElementById('llmOcrBtn').addEventListener('click', async () => {
  if (!currentImageFile) {
    alert('⚠️ Silakan ambil atau upload foto terlebih dahulu!');
    return;
  }

  showLoading(true, '🤖 Memproses dengan AI Vision (NVIDIA)...');
  ocrResult.style.display = 'block';
  ocrStatus.className = 'ocr-status';
  ocrStatus.textContent = '🤖 Mengirim gambar ke AI Vision...';

  try {
    const formData = new FormData();
    formData.append('image', currentImageFile);

    const response = await fetch('api/llm-ocr', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      const data = result.data;

      document.getElementById('name').value = data.name || '';
      document.getElementById('address').value = data.address || '';
      document.getElementById('phone').value = data.phone || '';
      document.getElementById('notes').value = data.notes || '';

      ocrStatus.className = 'ocr-status success';
      ocrStatus.innerHTML = `✅ AI Vision berhasil membaca gambar!`;

      // Check for duplicates
      if (data.name) {
        await checkForDuplicates(data.name);
      }
    } else {
      ocrStatus.className = 'ocr-status error';
      ocrStatus.textContent = '❌ ' + result.error;
    }

  } catch (error) {
    console.error('LLM OCR Error:', error);
    ocrStatus.className = 'ocr-status error';
    ocrStatus.textContent = '❌ Terjadi kesalahan saat memproses dengan AI Vision.';
  } finally {
    showLoading(false);
  }
});

clearImageBtn.addEventListener('click', () => {
  currentImageFile = null;
  currentImageDataUrl = null;
  existingContactId = null;
  imagePreview.style.display = 'none';
  ocrResult.style.display = 'none';
  duplicateWarning.style.display = 'none';
  fileInput.value = '';
});

// ==================== DUPLICATE HANDLING ====================
useExistingBtn.addEventListener('click', async () => {
  if (!existingContactId) return;
  
  try {
    const response = await fetch('api/daily/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: existingContactId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (result.data.alreadyCheckedIn) {
        alert('ℹ️ Kontak sudah di-check-in hari ini!');
      } else {
        alert('✅ Kontak sudah ada, berhasil di-check-in untuk hari ini!');
      }
      
      // Reset form
      contactForm.reset();
      imagePreview.style.display = 'none';
      ocrResult.style.display = 'none';
      duplicateWarning.style.display = 'none';
      existingContactId = null;
      
      // Switch to daily view
      document.querySelector('[data-tab="daily"]').click();
    } else {
      alert('❌ Gagal: ' + result.error);
    }
    
  } catch (error) {
    console.error('Error checking in:', error);
    alert('❌ Terjadi kesalahan');
  }
});

addNewBtn.addEventListener('click', () => {
  duplicateWarning.style.display = 'none';
  existingContactId = null;
});

// ==================== OCR PROCESSING ====================
async function processImage() {
  showLoading(true);
  ocrResult.style.display = 'block';
  ocrStatus.className = 'ocr-status';
  ocrStatus.textContent = 'Memproses gambar dengan AI OCR...';
  duplicateWarning.style.display = 'none';
  
  try {
    // Use Tesseract.js for OCR
    const result = await Tesseract.recognize(
      currentImageDataUrl,
      'ind+eng',
      {
        logger: info => {
          if (info.status === 'recognizing text') {
            const progress = Math.round(info.progress * 100);
            ocrStatus.textContent = `Membaca teks... ${progress}%`;
          }
        }
      }
    );
    
    recognizedText = result.data.text;
    
    if (recognizedText.trim()) {
      // Parse the recognized text to extract name and address
      const parsed = parseOCRText(recognizedText);
      
      document.getElementById('name').value = parsed.name;
      document.getElementById('address').value = parsed.address;
      document.getElementById('phone').value = parsed.phone;
      
      ocrStatus.className = 'ocr-status success';
      ocrStatus.innerHTML = `✅ Teks berhasil dibaca!`;
      
      // Check for duplicates
      if (parsed.name) {
        await checkForDuplicates(parsed.name);
      }
    } else {
      ocrStatus.className = 'ocr-status error';
      ocrStatus.textContent = '❌ Tidak dapat membaca teks dari gambar. Silakan coba dengan gambar lain.';
    }
    
  } catch (error) {
    console.error('OCR Error:', error);
    ocrStatus.className = 'ocr-status error';
    ocrStatus.textContent = '❌ Terjadi kesalahan saat memproses gambar.';
  } finally {
    showLoading(false);
  }
}

// Check for duplicate contacts
async function checkForDuplicates(name) {
  try {
    const response = await fetch(`api/check-duplicate?name=${encodeURIComponent(name)}`);
    const result = await response.json();
    
    if (result.success && result.data.length > 0) {
      existingContactId = result.data[0].id;
      
      similarContacts.innerHTML = result.data.map(contact => `
        <div class="similar-contact">
          <strong>${escapeHtml(contact.name)}</strong>
          <p>${escapeHtml(contact.address)}</p>
        </div>
      `).join('');
      
      duplicateWarning.style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking duplicates:', error);
  }
}

// Parse OCR text to extract structured data
function parseOCRText(text) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let name = '';
  let address = '';
  let phone = '';
  
  // Try to find phone number (Indonesian format)
  const phoneRegex = /(?:\+62|62|0)[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    phone = phoneMatch[0].replace(/\s/g, '');
  }
  
  // Try to find address patterns
  const addressKeywords = ['jalan', 'jl', 'street', 'address', 'alamat', 'komplek', 'blok', 'no', 'rt', 'rw', 'kec', 'kab', 'kota', 'provinsi'];
  let addressLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const lowerLine = lines[i].toLowerCase();
    if (addressKeywords.some(keyword => lowerLine.includes(keyword))) {
      addressLines.push(lines[i]);
      // Also grab next line if it looks like continuation
      if (i + 1 < lines.length && !lines[i + 1].match(phoneRegex)) {
        const nextLower = lines[i + 1].toLowerCase();
        if (!addressKeywords.some(kw => nextLower.includes(kw))) {
          // Check if it's not a name (usually short)
          if (lines[i + 1].length > 10) {
            addressLines.push(lines[i + 1]);
          }
        }
      }
    }
  }
  
  address = addressLines.join(', ');
  
  // First non-empty line that doesn't match phone or address is likely the name
  for (const line of lines) {
    if (!line.match(phoneRegex) && !address.includes(line) && line.length > 2 && line.length < 100) {
      // Check if it looks like a name (not all numbers, not all uppercase addresses)
      if (!line.match(/^\d+$/) && !line.match(/^(JL|JALAN|NO|RT|RW)/i)) {
        name = line;
        break;
      }
    }
  }
  
  // If no name found, use first line
  if (!name && lines.length > 0) {
    name = lines[0];
  }
  
  // If no address found, use remaining text
  if (!address && lines.length > 1) {
    address = lines.slice(1).join(', ');
  }
  
  return { name, address, phone };
}

// ==================== FORM SUBMISSION ====================
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // If using existing contact, handle differently
  if (existingContactId) {
    useExistingBtn.click();
    return;
  }
  
  const formData = new FormData();
  formData.append('name', document.getElementById('name').value);
  formData.append('address', document.getElementById('address').value);
  formData.append('phone', document.getElementById('phone').value);
  formData.append('notes', document.getElementById('notes').value);
  
  const lat = document.getElementById('latitude').value;
  const lng = document.getElementById('longitude').value;
  if (lat) formData.append('latitude', lat);
  if (lng) formData.append('longitude', lng);
  
  if (currentImageFile) {
    formData.append('image', currentImageFile);
  }
  
  try {
    const response = await fetch('api/contacts', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    if (result.success) {
      const message = result.data.existing 
        ? '✅ Kontak sudah ada! Berhasil di-check-in untuk hari ini.'
        : '✅ Kontak baru berhasil disimpan dan di-check-in!';
      
      alert(message);
      contactForm.reset();
      imagePreview.style.display = 'none';
      ocrResult.style.display = 'none';
      duplicateWarning.style.display = 'none';
      existingContactId = null;
      currentImageFile = null;
      currentImageDataUrl = '';
      
      // Switch to daily view
      document.querySelector('[data-tab="daily"]').click();
    } else {
      alert('❌ Gagal menyimpan: ' + result.error);
    }
    
  } catch (error) {
    console.error('Error saving contact:', error);
    alert('❌ Terjadi kesalahan saat menyimpan kontak');
  }
});

// ==================== DAILY VIEW ====================
async function loadDailyCheckins() {
  try {
    const response = await fetch('api/daily');
    const result = await response.json();
    
    if (result.success && result.data.length > 0) {
      dailyCount.textContent = result.data.length;
      dailyList.innerHTML = result.data.map(contact => createDailyContactCard(contact)).join('');
    } else {
      dailyCount.textContent = '0';
      dailyList.innerHTML = '<p class="empty-state">Belum ada kontak hari ini.<br>Ambil foto untuk menambah kontak!</p>';
    }
    
  } catch (error) {
    console.error('Error loading daily checkins:', error);
    dailyList.innerHTML = '<p class="empty-state">Gagal memuat data</p>';
  }
}

function createDailyContactCard(contact) {
  // Create Google Maps link
  let mapsLink = '';
  if (contact.latitude && contact.longitude) {
    mapsLink = `https://www.google.com/maps?q=${contact.latitude},${contact.longitude}`;
  } else if (contact.address) {
    mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
  }
  
  const checkinTime = new Date(contact.checkin_time).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Location status
  const hasLocation = contact.latitude && contact.longitude;
  const locationStatus = hasLocation 
    ? `<div class="meta"><span>📍 ${contact.latitude.toFixed(6)}, ${contact.longitude.toFixed(6)}</span></div>`
    : `<div class="meta location-missing"><span>⚠️ Lokasi belum diatur</span></div>`;
  
  return `
    <div class="contact-item daily">
      ${contact.image_path ? `<img src="${contact.image_path}" alt="Foto" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : ''}
      <div class="contact-header">
        <h3>👤 ${escapeHtml(contact.name)}</h3>
        <span class="checkin-time">⏰ ${checkinTime}</span>
      </div>
      <div class="address">📍 ${escapeHtml(contact.address)}</div>
      ${contact.phone ? `<div class="meta"><span>📞 ${escapeHtml(contact.phone)}</span></div>` : ''}
      ${locationStatus}
      
      <div class="actions">
        ${mapsLink ? `<a href="${mapsLink}" target="_blank" class="map-link">🗺️ Buka di Maps</a>` : ''}
        <button onclick="updateLocation(${contact.id})" class="btn btn-small btn-primary">📍 Update Lokasi</button>
        <button onclick="undoCheckin(${contact.id})" class="btn btn-small btn-danger">❌ Batal</button>
      </div>
    </div>
  `;
}

async function undoCheckin(contactId) {
  if (!confirm('Yakin ingin membatalkan check-in ini?')) return;
  
  try {
    const response = await fetch('api/daily/checkin', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      loadDailyCheckins();
    } else {
      alert('Gagal: ' + result.error);
    }
    
  } catch (error) {
    console.error('Error undoing checkin:', error);
  }
}

// ==================== UPDATE LOCATION ====================
async function updateLocation(contactId) {
  if (!navigator.geolocation) {
    alert('Browser tidak mendukung geolokasi');
    return;
  }
  
  // Show loading
  showLoading(true, 'Mendapatkan lokasi GPS...');
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      
      try {
        const response = await fetch(`api/contacts/${contactId}/location`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude, longitude })
        });
        
        const result = await response.json();
        
        if (result.success) {
          alert(`✅ Lokasi berhasil diperbarui!\n📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          loadDailyCheckins();
          loadAllContacts();
        } else {
          alert('❌ Gagal: ' + result.error);
        }
        
      } catch (error) {
        console.error('Error updating location:', error);
        alert('❌ Terjadi kesalahan saat update lokasi');
      } finally {
        showLoading(false);
      }
    },
    (error) => {
      showLoading(false);
      
      let errorMessage = 'Gagal mendapatkan lokasi';
      switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Izin lokasi ditolak. Aktifkan di pengaturan browser.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'Informasi lokasi tidak tersedia.';
            break;
        case error.TIMEOUT:
            errorMessage = 'Permintaan lokasi habis waktu.';
            break;
      }
      
      alert('❌ ' + errorMessage);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// ==================== ALL CONTACTS ====================
async function loadAllContacts(query = '') {
  try {
    const url = query ? `/api/search?q=${encodeURIComponent(query)}` : '/api/contacts';
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.success && result.data.length > 0) {
      allContactsList.innerHTML = result.data.map(contact => createAllContactCard(contact)).join('');
    } else {
      allContactsList.innerHTML = '<p class="empty-state">Tidak ada kontak ditemukan</p>';
    }
    
  } catch (error) {
    console.error('Error loading contacts:', error);
    allContactsList.innerHTML = '<p class="empty-state">Gagal memuat kontak</p>';
  }
}

function createAllContactCard(contact) {
  // Create Google Maps link
  let mapsLink = '';
  if (contact.latitude && contact.longitude) {
    mapsLink = `https://www.google.com/maps?q=${contact.latitude},${contact.longitude}`;
  } else if (contact.address) {
    mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
  }
  
  const date = new Date(contact.created_at).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  
  // Location status
  const hasLocation = contact.latitude && contact.longitude;
  const locationStatus = hasLocation 
    ? `<div class="meta"><span>📍 ${contact.latitude.toFixed(6)}, ${contact.longitude.toFixed(6)}</span></div>`
    : `<div class="meta location-missing"><span>⚠️ Lokasi belum diatur</span></div>`;
  
  return `
    <div class="contact-item">
      ${contact.image_path ? `<img src="${contact.image_path}" alt="Foto" style="width:100%;max-height:150px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : ''}
      <h3>👤 ${escapeHtml(contact.name)}</h3>
      <div class="address">📍 ${escapeHtml(contact.address)}</div>
      ${contact.phone ? `<div class="meta"><span>📞 ${escapeHtml(contact.phone)}</span></div>` : ''}
      ${contact.notes ? `<div class="meta"><span>📝 ${escapeHtml(contact.notes)}</span></div>` : ''}
      <div class="meta"><span>📅 ${date}</span></div>
      ${locationStatus}
      
      <div class="actions">
        ${mapsLink ? `<a href="${mapsLink}" target="_blank" class="map-link">🗺️ Buka di Maps</a>` : ''}
        <button onclick="updateLocation(${contact.id})" class="btn btn-small btn-primary">📍 Update Lokasi</button>
        <button onclick="checkinExisting(${contact.id})" class="btn btn-small btn-success">✅ Check-in</button>
        <button onclick="deleteContact(${contact.id})" class="btn btn-small btn-danger">🗑️ Hapus</button>
      </div>
    </div>
  `;
}

async function checkinExisting(contactId) {
  try {
    const response = await fetch('api/daily/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId })
    });
    
    const result = await response.json();
    
    if (result.success) {
      if (result.data.alreadyCheckedIn) {
        alert('ℹ️ Sudah di-check-in hari ini!');
      } else {
        alert('✅ Berhasil di-check-in!');
        loadAllContacts();
        document.querySelector('[data-tab="daily"]').click();
      }
    } else {
      alert('Gagal: ' + result.error);
    }
    
  } catch (error) {
    console.error('Error checking in:', error);
  }
}

async function deleteContact(id) {
  if (!confirm('Yakin ingin menghapus kontak ini?')) return;
  
  try {
    const response = await fetch(`api/contacts/${id}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      loadAllContacts();
    } else {
      alert('Gagal menghapus: ' + result.error);
    }
    
  } catch (error) {
    console.error('Error deleting contact:', error);
  }
}

// Search
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadAllContacts(e.target.value);
  }, 300);
});

// ==================== HISTORY ====================
async function loadHistory() {
  try {
    const response = await fetch('api/daily/history');
    const result = await response.json();
    
    if (result.success && result.data.length > 0) {
      historyList.innerHTML = result.data.map(item => `
        <div class="history-item" onclick="loadDayCheckins('${item.date}')">
          <span class="history-date">📅 ${formatDate(item.date)}</span>
          <span class="history-count">${item.total} kontak</span>
        </div>
      `).join('');
    } else {
      historyList.innerHTML = '<p class="empty-state">Belum ada riwayat check-in</p>';
    }
    
  } catch (error) {
    console.error('Error loading history:', error);
    historyList.innerHTML = '<p class="empty-state">Gagal memuat riwayat</p>';
  }
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('id-ID', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
}

async function loadDayCheckins(date) {
  try {
    const response = await fetch(`api/daily?date=${date}`);
    const result = await response.json();
    
    if (result.success) {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>📅 ${formatDate(date)}</h3>
          <p>${result.data.length} kontak di-check-in</p>
          <div class="modal-list">
            ${result.data.map(c => `
              <div class="modal-item">
                <strong>${escapeHtml(c.name)}</strong>
                <p>${escapeHtml(c.address)}</p>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-primary" onclick="this.closest('.modal').remove()">Tutup</button>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
  } catch (error) {
    console.error('Error loading day checkins:', error);
  }
}

// ==================== UTILITIES ====================
function showLoading(show, text = 'Memproses gambar dengan AI OCR...') {
  loadingText.textContent = text;
  loadingOverlay.style.display = show ? 'flex' : 'none';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Try to get current location for auto-fill
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      document.getElementById('latitude').value = position.coords.latitude.toFixed(6);
      document.getElementById('longitude').value = position.coords.longitude.toFixed(6);
    },
    (error) => {
      console.log('Location not available:', error);
    }
  );
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateDateDisplay();
  loadDailyCheckins();
});
