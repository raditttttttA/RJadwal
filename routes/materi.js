const express = require('express');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, getSignedUrl, deleteFile, downloadFile } = require('../storage');

const router = express.Router();

// simpan file di memory dulu (buffer), baru dikirim ke Supabase Storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function detectType(file) {
  const name = (file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'excel';
  if (mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'word';
  if (mime.startsWith('image/')) return 'foto';
  return 'lain';
}

function rowToMateri(r) {
  return {
    id: r.id,
    subjectKey: r.subject_key,
    subjectName: r.subject_name,
    type: r.type,
    fileName: r.file_name,
    url: r.url || undefined,
    uploadedAt: r.uploaded_at
  };
}

router.get('/', authMiddleware, async (req, res) => {
  const { subjectKey } = req.query;
  try {
    const result = subjectKey
      ? await db.execute({
          sql: 'SELECT * FROM materi WHERE user_id = ? AND subject_key = ? ORDER BY uploaded_at DESC',
          args: [req.userId, subjectKey]
        })
      : await db.execute({
          sql: 'SELECT * FROM materi WHERE user_id = ? ORDER BY uploaded_at DESC',
          args: [req.userId]
        });
    res.json(result.rows.map(rowToMateri));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil materi.' });
  }
});

router.post('/', authMiddleware, upload.single('file'), async (req, res) => {
  const { subjectKey, subjectName, mode } = req.body || {};

  if (!subjectKey || !subjectName) {
    return res.status(400).json({ error: 'Subject (matkul/tutor) tidak lengkap.' });
  }

  const id = randomUUID();
  const uploadedAt = new Date().toISOString();

  try {
    if (mode === 'link') {
      const { url, label } = req.body;
      if (!url) return res.status(400).json({ error: 'URL wajib diisi.' });

      await db.execute({
        sql: `INSERT INTO materi (id, user_id, subject_key, subject_name, type, file_name, mime_type, file_path, url, uploaded_at)
              VALUES (?, ?, ?, ?, 'link', ?, NULL, NULL, ?, ?)`,
        args: [id, req.userId, subjectKey, subjectName, label || url, url, uploadedAt]
      });

      return res.json({ id, subjectKey, subjectName, type: 'link', fileName: label || url, url, uploadedAt });
    }

    if (!req.file) return res.status(400).json({ error: 'File tidak ditemukan.' });

    const tipe = detectType(req.file);
    const storageKey = `${req.userId}/${randomUUID()}${path.extname(req.file.originalname || '')}`;
    await uploadFile(storageKey, req.file.buffer, req.file.mimetype);

    await db.execute({
      sql: `INSERT INTO materi (id, user_id, subject_key, subject_name, type, file_name, mime_type, file_path, url, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      args: [id, req.userId, subjectKey, subjectName, tipe, req.file.originalname, req.file.mimetype, storageKey, uploadedAt]
    });

    res.json({ id, subjectKey, subjectName, type: tipe, fileName: req.file.originalname, uploadedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengunggah materi.' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    if (row.file_path) {
      await deleteFile(row.file_path);
    }
    await db.execute({ sql: 'DELETE FROM materi WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus materi.' });
  }
});

// endpoint serve file: redirect ke signed URL Supabase (berlaku 60 detik),
// dipakai buat <iframe>/<img> src atau tombol download
router.get('/:id/file', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row || !row.file_path) return res.status(404).send('File tidak ditemukan.');

    const signedUrl = await getSignedUrl(row.file_path, 60);
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(404).send('File tidak ditemukan di server.');
  }
});

// endpoint untuk mengambil konten materi (teks/data) buat AI Quiz
router.get('/:id/content', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    if (row.type === 'link') {
      return res.json({ fileName: row.file_name, type: 'link', text: `Link: ${row.url}` });
    }

    if (!row.file_path) return res.status(400).json({ error: 'Bukan file.' });

    // Download file dari Supabase dan convert ke text
    const buffer = await downloadFile(row.file_path);
    let textContent = buffer.toString('utf8').substring(0, 20000); // Batasi 20k karakter

    res.json({ 
      fileName: row.file_name, 
      type: row.type, 
      text: textContent 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membaca konten materi.' });
  }
});

module.exports = router;
