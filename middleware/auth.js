/**
 * AUTHENTICATION MIDDLEWARE
 * -------------------------------------------------------------
 * Memvalidasi JSON Web Token (JWT) pada setiap request yang membutuhkan login.
 * Jika valid, user ID disimpan ke `req.userId` agar route handler berikutnya
 * bisa mengakses data khusus milik user tersebut.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ganti-secret-ini-lewat-env';

function authMiddleware(req, res, next) {
  let token = null;

  // 1. Ekstrak token dari Authorization Header (Format: "Bearer <token>")
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  }

  // 2. Fallback: Ekstrak token dari Query Parameter (?token=...)
  // Catatan: Elemen HTML seperti <img> atau <iframe> tidak dapat menyisipkan header kustom,
  // sehingga token diizinkan dikirim via query string untuk preview file.
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // 3. Jika token tidak ditemukan sama sekali
  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak: Anda belum login.' });
  }

  // 4. Verifikasi keaslian dan masa berlaku token
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId; // Simpan ID user ke object request
    next();
  } catch (err) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah kedaluwarsa, silakan login ulang.' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };

