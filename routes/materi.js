/**
 * MATERI & TUGAS ROUTES (/api/materi)
 * -------------------------------------------------------------
 * Menyediakan endpoint pengelolaan berkas materi kuliah dan tugas:
 * - GET    /api/materi              : Daftar materi/tugas milik user (opsional ?subjectKey=...)
 * - POST   /api/materi              : Tambah materi (link, file, atau tugas baru)
 * - POST   /api/materi/:id/complete : Tandai tugas selesai (+ upload foto bukti)
 * - POST   /api/materi/:id/uncomplete: Batalkan status selesai
 * - GET    /api/materi/:id/proof    : Redirect ke signed URL foto bukti
 * - DELETE /api/materi/:id          : Hapus materi/tugas & hapus fisik di Supabase
 * - GET    /api/materi/:id/file     : Redirect ke signed URL file materi (berlaku 60 detik)
 * - GET    /api/materi/:id/content  : Ambil konten file (Base64 / Teks) untuk preview/AI
 */

const express = require('express');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, getSignedUrl, deleteFile, downloadFile } = require('../storage');

const router = express.Router();

// Semua rute materi memerlukan autentikasi
router.use(authMiddleware);

// Konfigurasi Multer: file disimpan di memori (buffer) sementara sebelum dikirim ke Supabase Storage.
// Batas ukuran file: 25 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

/**
 * Deteksi tipe file berdasarkan MIME type atau ekstensi nama file.
 */
function detectType(file) {
  const name = (file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('spreadsheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'excel';
  if (mime.includes('word') || name.endsWith('.docx') || name.endsWith('.doc')) return 'word';
  if (mime.startsWith('image/')) return 'foto';
  return 'lain';
}

/**
 * Helper: Mengonversi baris database menjadi format JSON yang rapi untuk frontend.
 */
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

/**
 * GET /api/materi
 * Mengambil daftar materi/tugas. Bisa difilter per subject: /api/materi?subjectKey=xyz
 */
router.get('/', async (req, res) => {
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
    console.error('[Get Materi Error]:', err);
    res.status(500).json({ error: 'Gagal mengambil materi.' });
  }
});

/**
 * POST /api/materi
 * Mengunggah materi baru (mode link, mode file, atau mode tugas)
 */
router.post('/', upload.single('file'), async (req, res) => {
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

// =============================================================
// FITUR TUGAS: SELESAI & BUKTI
// =============================================================

/**
 * POST /api/materi/:id/complete
 * Menandai tugas telah selesai, dengan opsi mengunggah foto bukti penyelesaian.
 */
router.post('/:id/complete', upload.single('proof'), async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    let proofKey = row.proof_path || null;

    // Jika user mengunggah foto bukti baru
    if (req.file) {
      // Hapus foto bukti lama dari Supabase jika sebelumnya sudah ada
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
    console.error('[Complete Task Error]:', err);
    res.status(500).json({ error: 'Gagal menyelesaikan tugas.' });
  }
});

/**
 * POST /api/materi/:id/uncomplete
 * Membatalkan status selesai pada tugas dan menghapus foto bukti jika ada.
 */
router.post('/:id/uncomplete', async (req, res) => {
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
    console.error('[Uncomplete Task Error]:', err);
    res.status(500).json({ error: 'Gagal membatalkan status tugas.' });
  }
});

/**
 * GET /api/materi/:id/proof
 * Melihat foto bukti penyelesaian tugas (redirect ke signed URL sementara 60 detik).
 */
router.get('/:id/proof', async (req, res) => {
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
    console.error('[Proof View Error]:', err);
    res.status(404).send('Foto bukti tidak ditemukan di server.');
  }
});

// =============================================================
// HAPUS & AKSES FILE MATERI
// =============================================================

/**
 * DELETE /api/materi/:id
 * Menghapus materi atau tugas, sekaligus membersihkan file fisik dari Supabase Storage.
 */
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    // Hapus lampiran berkas fisik di Supabase jika ada
    if (row.file_path) {
      await deleteFile(row.file_path);
    }
    // Hapus foto bukti jika ada
    if (row.proof_path) {
      await deleteFile(row.proof_path);
    }

    await db.execute({ sql: 'DELETE FROM materi WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Delete Materi Error]:', err);
    res.status(500).json({ error: 'Gagal menghapus materi.' });
  }
});

/**
 * GET /api/materi/:id/file
 * Redirect ke Signed URL Supabase (berlaku 60 detik).
 * Digunakan oleh tag <iframe>, <img>, atau tombol unduh di frontend.
 */
router.get('/:id/file', async (req, res) => {
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
    console.error('[Serve File Error]:', err);
    res.status(404).send('File tidak ditemukan di server.');
  }
});

/**
 * GET /api/materi/:id/content
 * Mengunduh isi materi dan menyajikannya sebagai teks atau Base64.
 * Berguna untuk integrasi preview dokumen atau pemrosesan AI.
 */
router.get('/:id/content', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM materi WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.userId]
    });
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    // Kasus 1: Materi bertipe link web
    if (row.type === 'link') {
      return res.json({
        id: row.id,
        fileName: row.file_name,
        type: 'link',
        text: `Link Referensi: ${row.file_name}\nURL: ${row.url}`
      });
    }

    // Kasus 2: Materi bertipe tugas
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
          console.error('[Download Attachment Error]:', e);
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

    // Kasus 3: Jika tidak ada file fisik tersimpan
    if (!row.file_path) {
      return res.json({
        id: row.id,
        fileName: row.file_name,
        type: row.type || 'text',
        text: `Materi: ${row.file_name}\n${row.task_desc || row.url || ''}`
      });
    }

    // Kasus 4: Materi file (PDF, Word, Excel, Foto)
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
    console.error('[Read Content Error]:', err);
    res.status(500).json({ error: 'Gagal membaca konten materi.' });
  }
});

module.exports = router;
