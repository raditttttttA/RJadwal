/**
 * JADWAL / ITEMS ROUTES (/api/items)
 * -------------------------------------------------------------
 * Menyediakan endpoint CRUD untuk jadwal kegiatan / kuliah:
 * - GET    /api/items     : Mengambil semua jadwal milik user yang sedang login
 * - POST   /api/items     : Menambahkan jadwal baru
 * - PUT    /api/items/:id : Memperbarui jadwal berdasarkan ID
 * - DELETE /api/items/:id : Menghapus jadwal berdasarkan ID
 */

const express = require('express');
const { randomUUID } = require('crypto');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Pasang middleware autentikasi: semua endpoint di router ini wajib menyertakan token JWT
router.use(authMiddleware);

/**
 * Helper: Mengubah format baris database (snake_case)
 * ke format objek JSON yang diharapkan oleh frontend (camelCase).
 */
function rowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    time: row.time,
    endTime: row.end_time || '',
    note: row.note || '',
    tipe: row.tipe,
    days: JSON.parse(row.days) // Konversi teks JSON array menjadi array JavaScript asli
  };
}

/**
 * GET /api/items
 * Mengambil daftar jadwal milik user yang sedang aktif.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM items WHERE user_id = ?',
      args: [req.userId]
    });
    res.json(result.rows.map(rowToItem));
  } catch (err) {
    console.error('[Get Items Error]:', err);
    res.status(500).json({ error: 'Gagal mengambil jadwal.' });
  }
});

/**
 * POST /api/items
 * Menambahkan data jadwal baru.
 * Body: { title, time, endTime, note, tipe, days }
 */
router.post('/', async (req, res) => {
  const { title, time, endTime, note, tipe, days } = req.body || {};

  // Validasi kolom wajib
  if (!title || !time || !tipe || !Array.isArray(days) || days.length === 0) {
    return res.status(400).json({ error: 'Data jadwal tidak lengkap.' });
  }

  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO items (id, user_id, title, time, end_time, note, tipe, days)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, req.userId, title, time, endTime || '', note || '', tipe, JSON.stringify(days)]
    });
    res.json({ id, title, time, endTime: endTime || '', note: note || '', tipe, days });
  } catch (err) {
    console.error('[Create Item Error]:', err);
    res.status(500).json({ error: 'Gagal menyimpan jadwal.' });
  }
});

/**
 * PUT /api/items/:id
 * Mengupdate jadwal yang sudah ada (hanya jika milik user yang bersangkutan).
 */
router.put('/:id', async (req, res) => {
  const { title, time, endTime, note, tipe, days } = req.body || {};

  try {
    // Pastikan item ada dan benar-benar milik user yang sedang login
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });

    if (!title || !time || !tipe || !Array.isArray(days) || days.length === 0) {
      return res.status(400).json({ error: 'Data jadwal tidak lengkap.' });
    }

    await db.execute({
      sql: `UPDATE items SET title=?, time=?, end_time=?, note=?, tipe=?, days=? WHERE id=?`,
      args: [title, time, endTime || '', note || '', tipe, JSON.stringify(days), req.params.id]
    });

    res.json({ id: req.params.id, title, time, endTime: endTime || '', note: note || '', tipe, days });
  } catch (err) {
    console.error('[Update Item Error]:', err);
    res.status(500).json({ error: 'Gagal memperbarui jadwal.' });
  }
});

/**
 * DELETE /api/items/:id
 * Menghapus jadwal berdasarkan ID (hanya jika milik user yang sedang login).
 */
router.delete('/:id', async (req, res) => {
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' });

    await db.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Delete Item Error]:', err);
    res.status(500).json({ error: 'Gagal menghapus jadwal.' });
  }
});

module.exports = router;

