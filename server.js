require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { initDb } = require('./db');
const authRoutes = require('./routes/auth');
const itemsRoutes = require('./routes/items');
const materiRoutes = require('./routes/materi');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/materi', materiRoutes);

// dipakai kalau server dijalankan lokal (bukan di Vercel, karena di Vercel
// folder public sudah di-serve langsung sebagai static build, lihat vercel.json)
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Vercel akan mengimpor `app` ini langsung sebagai serverless function,
// jadi app.listen() hanya dijalankan saat file ini dieksekusi langsung (lokal)
if (require.main === module) {
  initDb().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server jalan di http://localhost:${PORT}`);
    });
  }).catch((err) => {
    console.error('Gagal inisialisasi database:', err);
    process.exit(1);
  });
} else {
  // di Vercel, pastikan tabel sudah ada sebelum request pertama diproses
  initDb().catch((err) => console.error('Gagal inisialisasi database:', err));
}

module.exports = app;
