# Agenda — Backend (Jadwal + Materi)

Backend Node.js/Express buat app jadwal "Agenda". Frontend (HTML/CSS/JS) ada di
folder `public/`, di-serve langsung oleh setup yang sama.

Versi ini pakai:
- **Turso** (database SQLite yang di-hosting, lewat `@libsql/client`) — ganti `better-sqlite3`
- **Supabase Storage** — ganti folder `uploads/` lokal
- **Vercel** — buat deploy (serverless, gratis, tanpa kartu kredit)

Kombinasi ini dipilih karena semuanya beneran gratis tanpa kartu kredit, dan
gak ada data yang hilang kalau server "tidur" atau di-redeploy — beda dari
disk lokal di banyak platform hosting gratis yang sifatnya sementara.

## Fitur
- Login & daftar akun (password di-hash pakai bcrypt, sesi pakai JWT)
- CRUD jadwal (matkul/tutor/lain), sinkron di semua device selama login pakai akun yang sama
- Materi per matkul/tutor: upload file (PDF/Word/Excel/foto) atau link, lihat, hapus
- Preview PDF & foto langsung di app; Word/Excel di-preview isinya (pakai Mammoth & SheetJS di sisi browser)

## Setup — 1) Bikin database di Turso (gratis, tanpa kartu kredit)

1. Daftar di https://turso.tech, lalu install CLI-nya:
   ```
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```
2. Bikin database baru:
   ```
   turso db create agenda-db
   ```
3. Ambil URL dan token-nya:
   ```
   turso db show agenda-db --url
   turso db tokens create agenda-db
   ```
   Simpan hasilnya buat `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`.

## Setup — 2) Bikin storage di Supabase (gratis, tanpa kartu kredit)

1. Daftar di https://supabase.com, buat project baru.
2. Buka menu **Storage** → buat bucket baru bernama `materi`, set jadi **Private**
   (biar file materi gak bisa diakses orang lain tanpa token login).
3. Buka **Project Settings → API**, salin:
   - `Project URL` → jadi `SUPABASE_URL`
   - `service_role` key (bukan `anon` key!) → jadi `SUPABASE_SERVICE_KEY`

   `service_role` key ini rahasia — jangan pernah dipakai di kode frontend,
   cuma dipakai di server.

## Menjalankan di komputer sendiri (lokal)

1. Pastikan sudah install [Node.js](https://nodejs.org) versi 18 ke atas.
2. Install dependency:
   ```
   npm install
   ```
3. Salin `.env.example` jadi `.env`, isi semua nilainya (JWT_SECRET, Turso, Supabase).
4. Jalankan:
   ```
   npm start
   ```
5. Buka `http://localhost:3000`. Tabel database otomatis dibuat saat pertama kali jalan.

## Deploy ke Vercel (gratis, tanpa kartu kredit)

1. Push folder project ini ke repo GitHub baru.
2. Buka https://vercel.com, daftar/login pakai akun GitHub.
3. Klik **Add New → Project**, pilih repo yang tadi dibuat.
4. Di bagian **Environment Variables**, tambahkan semua isi `.env` kamu:
   `JWT_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_KEY`, `SUPABASE_BUCKET`.
5. Klik **Deploy**. Vercel otomatis mendeteksi `vercel.json` dan menjalankan
   `server.js` sebagai serverless function, sementara folder `public/` di-serve
   langsung sebagai file statis.
6. Setelah selesai, Vercel kasih URL publik (misal `https://agenda-app.vercel.app`).

### Kenapa gak "tidur" atau kehilangan data lagi?
- Vercel serverless function gak butuh proses yang terus nyala 24 jam — jadi
  gak ada konsep "sleep lalu bangun 30-60 detik" seperti di Render free tier.
- Karena database & file sekarang di Turso/Supabase (bukan disk lokal server),
  data gak ikut hilang tiap kali function di-redeploy atau restart.
- Batas gratis Vercel Hobby, Turso, dan Supabase jauh lebih dari cukup untuk
  aplikasi jadwal + materi sekolah skala personal/kelas.

## Struktur folder
```
jadwal-backend/
├── server.js          # entry point Express, juga di-export sebagai handler Vercel
├── db.js              # koneksi Turso (libSQL) & setup tabel
├── storage.js          # wrapper Supabase Storage (upload/signed url/hapus file)
├── vercel.json         # routing: /api/* ke server.js, sisanya ke public/
├── middleware/
│   └── auth.js        # verifikasi JWT
├── routes/
│   ├── auth.js         # register & login
│   ├── items.js        # CRUD jadwal
│   └── materi.js        # upload/list/hapus/serve file materi
└── public/
    └── index.html      # seluruh frontend (HTML+CSS+JS dalam satu file)
```

## Keamanan
- Password di-hash pakai bcrypt, tidak pernah disimpan dalam bentuk asli.
- Setiap request ke API jadwal/materi wajib pakai token JWT (didapat setelah login).
- File materi disimpan di bucket Supabase yang **private**; akses file lewat
  signed URL sementara (berlaku 60 detik), bukan link publik permanen.
- Batas ukuran upload file: 25MB per file (bisa diubah di `routes/materi.js`, cari `fileSize`).
