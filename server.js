/**
 * MAIN SERVER ENTRY POINT
 * -------------------------------------------------------------
 * File ini adalah pusat aplikasi Express backend:
 * 1. Memuat environment variables (.env)
 * 2. Menginisialisasi middleware global (CORS, JSON Parser)
 * 3. Menjamin kesiapan tabel database (dbReady) sebelum menangani request
 * 4. Mendaftarkan API routes (/api/auth, /api/items, /api/materi)
 * 5. Menyajikan antarmuka frontend dari folder public/
 * 6. Mengekspor handler untuk Vercel serverless / app.listen untuk localhost
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const itemsRoutes = require('./routes/items');
const materiRoutes = require('./routes/materi');
const infoRoutes = require('./routes/info');

const app = express();

// =============================================================
// 1. GLOBAL MIDDLEWARE
// =============================================================
app.use(cors());
app.use(express.json());

// =============================================================
// 2. DATABASE READINESS GUARD
// =============================================================
// Memastikan skema database (CREATE TABLE IF NOT EXISTS) sudah selesai
// sebelum request pertama diproses. Sangat penting di Vercel (serverless cold start).
const dbReady = initDb().catch((err) => {
  console.error('[Database Init Error]: Gagal inisialisasi database:', err);
  throw err;
});

app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (err) {
    res.status(503).json({ error: 'Database belum siap, coba lagi beberapa saat.' });
  }
});

// =============================================================
// 3. API ROUTES
// =============================================================
app.use('/api/auth', authRoutes);     // Endpoint autentikasi (login, register)
app.use('/api/items', itemsRoutes);   // Endpoint CRUD jadwal kegiatan
app.use('/api/materi', materiRoutes); // Endpoint materi & tugas
app.use('/api/info', infoRoutes);     // Endpoint info beasiswa, lomba & event kampus

// =============================================================
// 4. FRONTEND STATIC ASSETS & SPA ROUTING
// =============================================================
// Melayani file HTML, CSS, JS, dan ikon dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: kirim index.html untuk semua route yang bukan /api/*
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =============================================================
// 5. SERVER BOOTSTRAP (LOKAL vs SERVERLESS)
// =============================================================
// Jika file ini dijalankan langsung via Node (node server.js), buka port HTTP.
// Jika diimpor oleh Vercel Serverless Function, export app tanpa app.listen.
if (require.main === module) {
  dbReady.then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    });
  }).catch(() => {
    process.exit(1);
  });
}

module.exports = app;

