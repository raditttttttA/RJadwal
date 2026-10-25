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
    filePath: r.file_path || undefined,
    mimeType: r.mime_type || undefined,
    url: r.url || undefined,
    uploadedAt: r.uploaded_at,
    deadline: r.deadline || undefined,
    taskDesc: r.task_desc || (r.type === 'tugas' && r.url && !r.url.startsWith('http') ? r.url : undefined),
    isCompleted: r.is_completed === 1 || r.is_completed === '1',
    completedAt: r.completed_at || undefined,
    hasProof: Boolean(r.proof_path)
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

    if (mode === 'tugas') {
      const taskTitle = (req.body.taskTitle || req.body.title || req.body.text || '').trim();
      const taskDesc = (req.body.taskDesc || '').trim();
      const deadline = req.body.deadline ? req.body.deadline.trim() : null;
      const attachmentType = req.body.attachmentType || 'none';

      if (!taskTitle) {
        return res.status(400).json({ error: 'Judul tugas wajib diisi.' });
      }

      let filePath = null;
      let mimeType = null;
      let linkUrl = null;

      if (attachmentType === 'file' && req.file) {
        mimeType = req.file.mimetype;
        filePath = `${req.userId}/${randomUUID()}${path.extname(req.file.originalname || '')}`;
        await uploadFile(filePath, req.file.buffer, req.file.mimetype);
      } else if (attachmentType === 'link' && req.body.linkUrl) {
        linkUrl = req.body.linkUrl.trim();
      }

      await db.execute({
        sql: `INSERT INTO materi (id, user_id, subject_key, subject_name, type, file_name, mime_type, file_path, url, uploaded_at, deadline, task_desc, is_completed, completed_at, proof_path)
              VALUES (?, ?, ?, ?, 'tugas', ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL)`,
        args: [
          id,
          req.userId,
          subjectKey,
          subjectName,
          taskTitle,
          mimeType,
          filePath,
          linkUrl,
          uploadedAt,
          deadline,
          taskDesc
        ]
      });

      return res.json({
        id,
        subjectKey,
        subjectName,
        type: 'tugas',
        fileName: taskTitle,
        taskDesc,
        deadline,
        url: linkUrl || undefined,
        filePath: filePath || undefined,
        mimeType: mimeType || undefined,
        isCompleted: false,
        uploadedAt
      });
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

// Endpoint untuk menandai tugas selesai (opsional dengan upload foto bukti)
router.post('/:id/complete', authMiddleware, upload.single('proof'), async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    let proofKey = row.proof_path || null;
    if (req.file) {
      if (row.proof_path) {
        await deleteFile(row.proof_path);
      }
      proofKey = `${req.userId}/proof_${randomUUID()}${path.extname(req.file.originalname || '.jpg')}`;
      await uploadFile(proofKey, req.file.buffer, req.file.mimetype);
    }

    const now = new Date().toISOString();
    await db.execute({
      sql: 'UPDATE materi SET is_completed = 1, completed_at = ?, proof_path = ? WHERE id = ?',
      args: [now, proofKey, req.params.id]
    });

    res.json({
      ok: true,
      id: req.params.id,
      isCompleted: true,
      completedAt: now,
      hasProof: Boolean(proofKey)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyelesaikan tugas.' });
  }
});

// Endpoint untuk membatalkan status tugas selesai
router.post('/:id/uncomplete', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    if (row.proof_path) {
      await deleteFile(row.proof_path);
    }

    await db.execute({
      sql: 'UPDATE materi SET is_completed = 0, completed_at = NULL, proof_path = NULL WHERE id = ?',
      args: [req.params.id]
    });

    res.json({ ok: true, id: req.params.id, isCompleted: false, hasProof: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membatalkan status tugas.' });
  }
});

// Endpoint untuk melihat foto bukti penyelesaian tugas (redirect ke signed URL 60s)
router.get('/:id/proof', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row || !row.proof_path) return res.status(404).send('Foto bukti tidak ditemukan.');

    const signedUrl = await getSignedUrl(row.proof_path, 60);
    res.redirect(signedUrl);
  } catch (err) {
    console.error(err);
    res.status(404).send('Foto bukti tidak ditemukan di server.');
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
    if (row.proof_path) {
      await deleteFile(row.proof_path);
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

// endpoint untuk mengambil konten materi (Base64 / Teks untuk AI Quiz)
router.get('/:id/content', authMiddleware, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    if (row.type === 'link') {
      return res.json({
        id: row.id,
        fileName: row.file_name,
        type: 'link',
        text: `Link Referensi: ${row.file_name}\nURL: ${row.url}`
      });
    }

    if (row.type === 'tugas') {
      let tugasText = `[TUGAS: ${row.file_name}]\n`;
      if (row.task_desc) tugasText += `Deskripsi/Detail: ${row.task_desc}\n`;
      else if (row.url && !row.url.startsWith('http')) tugasText += `Deskripsi/Detail: ${row.url}\n`;
      if (row.url && row.url.startsWith('http')) tugasText += `Link Tugas: ${row.url}\n`;
      if (row.deadline) tugasText += `Batas Waktu (Deadline): ${row.deadline}\n`;

      let base64 = null;
      let mimeType = null;
      if (row.file_path) {
        try {
          const buffer = await downloadFile(row.file_path);
          base64 = buffer.toString('base64');
          mimeType = row.mime_type || 'application/octet-stream';
        } catch (e) {
          console.error('Gagal unduh lampiran tugas:', e);
        }
      }

      return res.json({
        id: row.id,
        fileName: row.file_name,
        type: 'tugas',
        text: tugasText.trim(),
        base64: base64 || undefined,
        mimeType: mimeType || undefined
      });
    }

    // Jika berupa file (PDF, Word, Excel, Foto)
    if (!row.file_path) {
      return res.json({
        id: row.id,
        fileName: row.file_name,
        type: row.type || 'text',
        text: `Materi: ${row.file_name}\n${row.task_desc || row.url || ''}`
      });
    }

    const buffer = await downloadFile(row.file_path);
    const mimeType = row.mime_type || (row.type === 'pdf' ? 'application/pdf' : (row.type === 'foto' ? 'image/jpeg' : 'application/octet-stream'));
    
    res.json({ 
      id: row.id,
      fileName: row.file_name, 
      type: row.type, 
      mimeType: mimeType,
      base64: buffer.toString('base64')
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membaca konten materi.' });
  }
});

module.exports = router;
