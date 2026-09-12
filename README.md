# Agenda — Backend (Jadwal + Materi)

Backend Node.js/Express + SQLite buat app jadwal "Agenda". Frontend (HTML/CSS/JS)
ada di folder `public/`, di-serve langsung oleh server yang sama — jadi cuma
perlu deploy satu server, gak perlu GitHub Pages lagi.

## Fitur
- Login & daftar akun (password di-hash pakai bcrypt, sesi pakai JWT)
- CRUD jadwal (matkul/tutor/lain), sinkron di semua device selama login pakai akun yang sama
- Materi per matkul/tutor: upload file (PDF/Word/Excel/foto) atau link, lihat, hapus
- Preview PDF & foto langsung di app; Word/Excel di-preview isinya (pakai Mammoth & SheetJS di sisi browser)

## Menjalankan di komputer sendiri (lokal)

1. Pastikan sudah install [Node.js](https://nodejs.org) versi 18 ke atas.
2. Buka folder ini di terminal, lalu install dependency:
   ```
   npm install
   ```
3. Salin file `.env.example` jadi `.env`:
   ```
   cp .env.example .env
   ```
   Buka file `.env`, ganti `JWT_SECRET` dengan string acak yang panjang (bebas, contoh: hasil dari https://randomkeygen.com).
4. Jalankan servernya:
   ```
   npm start
   ```
5. Buka `http://localhost:3000` di browser. Daftar akun baru, lalu mulai pakai.

Database (`data.db`) dan file upload (folder `uploads/`) otomatis dibuat sendiri
saat pertama kali dijalankan — gak perlu setup database terpisah.

## Deploy online (biar bisa diakses dari HP & di mana aja)

Karena ini server Node.js beneran (bukan file statis), **GitHub Pages tidak bisa
dipakai lagi**. Rekomendasi termudah & gratis: **Render.com**.

### Langkah deploy ke Render

1. Push folder project ini ke repo GitHub baru (bisa nama apa aja, misal `agenda-backend`).
   - **Jangan lupa**: folder `node_modules/`, file `.env`, dan `data.db` sudah otomatis
     diabaikan lewat `.gitignore`, jadi gak usah diupload manual.
2. Buka [render.com](https://render.com), daftar/login (bisa pakai akun GitHub langsung).
3. Klik **New +** → **Web Service**.
4. Pilih **Build and deploy from a Git repository**, hubungkan ke repo GitHub yang tadi dibuat.
5. Isi konfigurasi:
   - **Name**: bebas, misal `agenda-app`
   - **Region**: pilih yang paling dekat (misal Singapore)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
6. Di bagian **Environment Variables**, tambahkan:
   - `JWT_SECRET` = (string acak yang panjang, sama seperti di `.env` lokal — atau bikin baru)
7. Klik **Create Web Service**. Tunggu proses build & deploy (beberapa menit).
8. Setelah selesai, Render kasih URL publik (misal `https://agenda-app.onrender.com`).
   Itu link yang dipakai buat buka app-nya dari HP/laptop mana pun.

### Catatan penting soal Render Free Tier
- Server gratis Render akan "tidur" kalau gak ada yang akses selama beberapa
  menit, dan perlu ~30-60 detik buat "bangun" lagi pas diakses ulang. Ini normal
  buat tier gratis, bukan bug.
- **Penyimpanan file (`uploads/`) di Render Free Tier bersifat sementara** —
  kalau server di-restart/redeploy, file yang udah diupload bisa hilang (databasenya,
  `data.db`, juga ikut ke-reset). Kalau materi/jadwal harus benar-benar permanen,
  langkah selanjutnya adalah pindah penyimpanan file ke layanan seperti
  Cloudflare R2/AWS S3, dan database ke layanan seperti Render PostgreSQL (berbayar)
  atau Turso/Neon (ada tier gratis). Kasih tahu aja kalau mau upgrade ke arah situ.

## Struktur folder
```
jadwal-backend/
├── server.js          # entry point Express
├── db.js              # setup database SQLite
├── middleware/
│   └── auth.js        # verifikasi JWT
├── routes/
│   ├── auth.js         # register & login
│   ├── items.js        # CRUD jadwal
│   └── materi.js        # upload/list/hapus/serve file materi
├── public/
│   └── index.html      # seluruh frontend (HTML+CSS+JS dalam satu file)
├── uploads/             # file materi yang diupload (dibuat otomatis)
└── data.db              # database SQLite (dibuat otomatis)
```

## Keamanan
- Password di-hash pakai bcrypt, tidak pernah disimpan dalam bentuk asli.
- Setiap request ke API jadwal/materi wajib pakai token JWT (didapat setelah login).
- Batas ukuran upload file: 25MB per file (bisa diubah di `routes/materi.js`, cari `fileSize`).
