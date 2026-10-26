/**
 * AUTH ROUTES (/api/auth)
 * -------------------------------------------------------------
 * Menyediakan endpoint otentikasi pengguna:
 * - POST /api/auth/register : Mendaftar akun baru
 * - POST /api/auth/login    : Masuk akun dan mendapatkan token JWT
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/auth/register
 * Body: { username, password }
 */
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};

  // 1. Validasi input dasar
  if (!username || !password) {
    return res.status(400).json({ error: 'Username & password wajib diisi.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter.' });
  }

  try {
    // 2. Periksa apakah username sudah terdaftar
    const existing = await db.execute({
      sql: 'SELECT id FROM users WHERE username = ?',
      args: [username]
    });
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username sudah dipakai.' });
    }

    // 3. Hash password dengan salt rounds 10
    const hash = bcrypt.hashSync(password, 10);
    const info = await db.execute({
      sql: 'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      args: [username, hash, new Date().toISOString()]
    });

    // 4. Generate token JWT (berlaku 90 hari)
    const userId = Number(info.lastInsertRowid);
    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, username });
  } catch (err) {
    console.error('[Auth Register Error]:', err);
    res.status(500).json({ error: 'Gagal mendaftar, coba lagi.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  try {
    // 1. Cari user berdasarkan username
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE username = ?',
      args: [username]
    });
    const user = result.rows[0];

    // 2. Cocokkan password plain text dengan hash yang tersimpan
    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    // 3. Buat token JWT baru
    const token = jwt.sign({ userId: Number(user.id) }, JWT_SECRET, { expiresIn: '90d' });
    res.json({ token, username: user.username });
  } catch (err) {
    console.error('[Auth Login Error]:', err);
    res.status(500).json({ error: 'Gagal login, coba lagi.' });
  }
});

module.exports = router;

