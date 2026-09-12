// Wrapper tipis di atas Supabase Storage, dipakai buat ganti disk lokal (uploads/)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKET = process.env.SUPABASE_BUCKET || 'materi';

async function uploadFile(key, buffer, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType, upsert: false });
  if (error) throw error;
  return key;
}

async function getSignedUrl(key, expiresInSeconds = 60) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(key, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

async function deleteFile(key) {
  // gagal hapus fisik gak fatal, sama seperti versi lokal dulu
  await supabase.storage.from(BUCKET).remove([key]).catch(() => {});
}

module.exports = { uploadFile, getSignedUrl, deleteFile, BUCKET };
