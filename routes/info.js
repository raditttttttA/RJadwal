/**
 * CAMPUS INFO ROUTES (/api/info)
 * -------------------------------------------------------------
 * Menyediakan endpoint CRUD untuk informasi beasiswa, lomba, dan event kampus:
 * - GET    /api/info     : Mengambil semua daftar info kampus (terurut deadline terdekat)
 * - POST   /api/info     : Menambahkan info beasiswa/lomba/event baru
 * - DELETE /api/info/:id : Menghapus info berdasarkan ID
 */

const express = require('express');
const { randomUUID } = require('crypto');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Semua akses info kampus terlindungi oleh autentikasi JWT
router.use(authMiddleware);

/**
 * Helper: Mengubah format kolom database ke format camelCase JSON.
 */
function rowToInfo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,       // 'beasiswa' | 'lomba' | 'event'
    title: row.title,
    organizer: row.organizer || '',
    deadlineDate: row.deadline_date || '',
    description: row.description || '',
    linkUrl: row.link_url || '',
    imageUrl: row.image_url || '',
    createdAt: row.created_at
  };
}

/**
 * GET /api/info
 * Mengambil seluruh info kampus yang tersimpan di database.
 */
router.get('/', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM campus_info ORDER BY deadline_date ASC, created_at DESC;',
      args: []
    });
    res.json(result.rows.map(rowToInfo));
  } catch (err) {
    console.error('[Get Campus Info Error]:', err);
    res.status(500).json({ error: 'Gagal mengambil informasi kampus.' });
  }
});

/**
 * POST /api/info
 * Menambahkan info beasiswa/lomba/event baru.
 * Body: { category, title, organizer, deadlineDate, description, linkUrl, imageUrl }
 */
router.post('/', async (req, res) => {
  try {
    const { category, title, organizer, deadlineDate, description, linkUrl, imageUrl } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Judul informasi wajib diisi.' });
    }
    if (!category || !['beasiswa', 'lomba', 'event'].includes(category)) {
      return res.status(400).json({ error: 'Kategori harus berupa beasiswa, lomba, atau event.' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO campus_info (id, user_id, category, title, organizer, deadline_date, description, link_url, image_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      args: [
        id,
        req.userId || null,
        category,
        title.trim(),
        (organizer || '').trim(),
        deadlineDate || null,
        (description || '').trim(),
        (linkUrl || '').trim(),
        (imageUrl || '').trim(),
        now
      ]
    });

    res.status(201).json({
      id,
      userId: req.userId,
      category,
      title: title.trim(),
      organizer: (organizer || '').trim(),
      deadlineDate: deadlineDate || null,
      description: (description || '').trim(),
      linkUrl: (linkUrl || '').trim(),
      imageUrl: (imageUrl || '').trim(),
      createdAt: now
    });
  } catch (err) {
    console.error('[Create Campus Info Error]:', err);
    res.status(500).json({ error: 'Gagal menyimpan informasi kampus baru.' });
  }
});

/**
 * DELETE /api/info/:id
 * Menghapus data info kampus berdasarkan ID.
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute({
      sql: 'DELETE FROM campus_info WHERE id = ?;',
      args: [id]
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Delete Campus Info Error]:', err);
    res.status(500).json({ error: 'Gagal menghapus informasi.' });
  }
});

module.exports = router;
