/**
 * STORAGE WRAPPER (Supabase Storage)
 * -------------------------------------------------------------
 * Modul ini bertindak sebagai perantara penyimpanan file berkas materi & bukti tugas.
 * Menggantikan penyimpanan lokal (folder uploads/) agar file tetap tersimpan
 * meskipun backend di-deploy ke platform serverless (seperti Vercel).
 */

const { createClient } = require('@supabase/supabase-js');

let supabase = null;

/**
 * Lazy getter untuk Supabase client.
 * Menghindari server crash saat startup jika user belum mengisi kredensial Supabase di .env.
 */
function getClient() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      throw new Error('Kredensial Supabase (SUPABASE_URL & SUPABASE_SERVICE_KEY) belum diisi di .env.');
    }
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return supabase;
}

const BUCKET = process.env.SUPABASE_BUCKET || 'materi';

/**
 * Mengunggah file (dalam bentuk buffer memori) ke Supabase Storage.
 * @param {string} key - Path unik file di dalam bucket (misal: "userId/uuid.pdf")
 * @param {Buffer} buffer - Konten file biner
 * @param {string} contentType - MIME type (misal: "application/pdf")
 */
async function uploadFile(key, buffer, contentType) {
  const client = getClient();
  const { error } = await client.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
  return key;
}

/**
 * Membuat Signed URL sementara untuk membaca file dari bucket privat.
 * @param {string} key - Path file di bucket
 * @param {number} expiresInSeconds - Masa berlaku URL dalam detik (default 60 detik)
 */
async function getSignedUrl(key, expiresInSeconds = 60) {
  const client = getClient();
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Menghapus file fisik dari Supabase Storage.
 * @param {string} key - Path file di bucket
 */
async function deleteFile(key) {
  try {
    const client = getClient();
    await client.storage.from(BUCKET).remove([key]);
  } catch (err) {
    // Gagal hapus fisik tidak menghentikan proses penghapusan data di database
    console.warn(`[Storage] Gagal menghapus file: ${key}`, err.message);
  }
}

/**
 * Mengunduh file sebagai Buffer (berguna jika server perlu memproses konten file).
 * @param {string} key - Path file di bucket
 * @returns {Promise<Buffer>}
 */
async function downloadFile(key) {
  const client = getClient();
  const { data, error } = await client.storage.from(BUCKET).download(key);
  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { uploadFile, getSignedUrl, deleteFile, downloadFile, BUCKET };

