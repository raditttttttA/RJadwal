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
// Memastikan skema database sudah siap sebelum menangani request API.
// Menggunakan lazy promise yang dapat di-retry jika terjadi network hiccup saat cold start.
let dbReadyPromise = null;

function ensureDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = initDb().catch((err) => {
      console.error('[Database Init Error]: Gagal inisialisasi database:', err);
      // Reset promise agar request berikutnya dapat mencoba lagi, bukan terkunci permanen di 503
      dbReadyPromise = null;
      throw err;
    });
  }
  return dbReadyPromise;
}

// Trigger inisialisasi awal di background
ensureDb().catch(() => {});

app.use(async (req, res, next) => {
  // Hanya cegat route /api/* agar file statis frontend tetap disajikan lancar
  if (!req.path.startsWith('/api')) {
    return next();
  }
  try {
    await ensureDb();
    next();
  } catch (err) {
    res.status(503).json({
      error: 'Database belum siap, coba lagi beberapa saat.',
      details: err.message
    });
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
  ensureDb().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
    });
  }).catch(() => {
    process.exit(1);
  });
}

module.exports = app;

