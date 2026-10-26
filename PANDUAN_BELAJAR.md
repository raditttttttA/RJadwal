# 📚 Panduan Mempelajari Kode Backend Agenda

Dokumen ini dibuat khusus untuk mempermudah kamu memahami struktur, arsitektur, dan cara kerja kode di dalam proyek ini langkah demi langkah.

---

1. Peta File & Tanggung Jawabnya

Proyek ini menggunakan pola arsitektur modular route & middleware berbasis Express.js:

```
jadwal-backend-v2/

 server.js            # 🚪 Pintu Utama (Entry Point)
                        # Menyatukan middleware, rute API, database guard, dan frontend.

 db.js                # 🗄️ Lapisan Database (Database Layer)
                        # Mengatur koneksi (Turso libSQL / SQLite lokal) dan pembuatan tabel.

 storage.js           # ☁️ Lapisan Penyimpanan File (Storage Layer)
                        # Berinteraksi dengan Supabase Storage (upload, signed URL, delete).

 middleware/
 auth.js          # 🛡️ Satpam Autentikasi (Auth Guard)
                        # Memeriksa dan memverifikasi token JWT dari header atau query URL.

 routes/
 auth.js          # 🔐 Endpoint Login & Registrasi (/api/auth)
 items.js         # 📅 Endpoint CRUD Jadwal Kuliah (/api/items)
 materi.js        # 📂 Endpoint Upload Materi & Tugas (/api/materi)

 public/              # 🌐 Tampilan Pengguna (Frontend)
 index.html       # Antarmuka SPA lengkap (HTML, CSS, dan JavaScript vanila)
 manifest.json    # Konfigurasi PWA (bisa diinstall di HP/Desktop)
icon-*.png       # Ikon aplikasi

 .env.example         # 📝 Contoh konfigurasi variabel lingkungan (Environment Variables)
 vercel.json          # ⚙️ Konfigurasi deploy serverless ke Vercel
package.json         # 📦 Daftar dependensi library & script runner
```

---

2. Alur Hidup Request (Request Lifecycle)

Ketika pengguna melakukan tindakan di aplikasi (misal: menambah jadwal), inilah alur yang dilalui:

```
[ Browser / Frontend ]
 (Kirim HTTP Request, misal: POST /api/items dengan Authorization: Bearer <token>)
         ▼
[ server.js ]
  1. CORS Middleware    > Mengizinkan akses dari domain frontend
  2. Express.json Middleware  >  Mengubah body request JSON jadi objek JS (`req.body`)
  3. dbReady Middleware       > Menahan request sampai database dipastikan siap
  4. Routing ke /api/items     > Diteruskan ke routes/items.js
         
[ middleware/auth.js ]
   Membaca token JWT -> Jika valid: isi `req.userId` & lanjut; Jika salah: return 401 Unauthorized
         
[ routes/items.js ]
   Membaca `req.body` & `req.userId`
   Menjalankan query SQL: `INSERT INTO items (...) VALUES (...)`
      
[ db.js ]
  Menjalankan query ke Turso Cloud atau SQLite lokal
         
[ Response JSON ] -> Dikirim kembali ke browser dengan data jadwal yang baru dibuat
```

---

3. Konsep-Konsep Penting yang Dipakai

A. Autentikasi Modern: Bcrypt & JWT
- Bcrypt (`bcryptjs`): Password tidak pernah disimpan dalam bentuk teks biasa. Di `routes/auth.js`, password di-hash satu arah dengan garam (salt) acak. Saat login, bcrypt membandingkan password yang diketik dengan hash di database.
- JSON Web Token (`jsonwebtoken`): Setelah login berhasil, server menerbitkan token digital terenkripsi yang berisi identitas user (`userId`). Token ini disimpan oleh browser (biasanya di `localStorage`) dan dikirim kembali di setiap request berikutnya.

B. Isolasi Data Antar Pengguna (Multi-Tenancy)
Perhatikan query di `routes/items.js` dan `routes/materi.js`:
sql
SELECT * FROM items WHERE user_id = ?
UPDATE items SET ... WHERE id = ? AND user_id = ?
DELETE FROM items WHERE id = ? AND user_id = ?

Klausa `user_id = req.userId` memastikan pengguna hanya dapat membaca, mengubah, atau menghapus datanya sendiri, tidak bisa mengintip atau merusak data pengguna lain.

C. Fleksibilitas Database (Adapter Pattern di `db.js`)
Proyek ini mendukung 2 mode database:
1. Turso Cloud (libSQL: Database SQLite di cloud yang sangat cepat dan gratis, cocok untuk deploy online.
2. SQLite Lokal (`better-sqlite3`): File `jadwal.db` di komputermu sendiri, cocok untuk latihan offline.

Di `db.js`, dibuat fungsi wrapper `db.execute()` untuk SQLite lokal agar bentuk pemanggilannya sama persis dengan `@libsql/client`:
javascript
// Kode di router tetap sama untuk kedua database:
await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });


D. Private Cloud Storage & Signed URL di `storage.js`
- Berkas materi (PDF, DOCX, foto) tidak disimpan di disk server karena serverless seperti Vercel bersifat stateless (file yang disimpan di disk lokal akan hilang saat server sleep).
- Berkas diunggah ke Supabase Storage pada bucket yang berstatus Private.
- Agar aman dari akses publik tak berizin, file diakses melalui Signed URL sementara (hanya berlaku 60 detik) yang digenerate oleh server saat user meminta file (`GET /api/materi/:id/file`).

---

4. Kamus Endpoint API

| Method | Endpoint | Perlu Login? | Keterangan |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/register` | ❌ | Daftar akun baru (`username`, `password`) |
| `POST` | `/api/auth/login` | ❌ | Masuk akun, mengembalikan `token` JWT |
| `GET` | `/api/items` | ✅ | Mengambil seluruh jadwal milik user yang login |
| `POST` | `/api/items` | ✅ | Membuat jadwal baru (`title`, `time`, `tipe`, `days`, dll.) |
| `PUT` | `/api/items/:id` | ✅ | Memperbarui jadwal berdasarkan ID |
| `DELETE`| `/api/items/:id` | ✅ | Menghapus jadwal berdasarkan ID |
| `GET` | `/api/materi` | ✅ | Mengambil daftar materi/tugas (opsional filter `?subjectKey=...`) |
| `POST` | `/api/materi` | ✅ | Mengunggah file/link/tugas baru |
| `POST` | `/api/materi/:id/complete` | ✅ | Menandai tugas selesai (+ opsional upload foto bukti) |
| `POST` | `/api/materi/:id/uncomplete` | ✅ | Membatalkan status selesai pada tugas |
| `GET` | `/api/materi/:id/proof` | ✅ | Redirect ke foto bukti tugas (signed URL 60 detik) |
| `DELETE`| `/api/materi/:id` | ✅ | Menghapus materi & menghapus berkas fisik di Supabase |
| `GET` | `/api/materi/:id/file` | ✅ | Redirect ke signed URL file materi untuk preview/unduh |
| `GET` | `/api/materi/:id/content` | ✅ | Mengambil isi file dalam bentuk Base64/Teks |

---

5. Ide Eksperimen untuk Mengasah Skill

Jika kamu ingin belajar langsung sambil memodifikasi kode:
1. Latihan Validasi (Mudah):
   - Buka `routes/auth.js`.
   - Tambahkan aturan: username harus minimal 3 karakter dan tidak boleh mengandung spasi.
2. Latihan Kolom Baru (Menengah):
   - Tambahkan kolom baru pada jadwal (misal: `ruangan` atau `dosen`) di `initDb()` pada `db.js`.
   - Sesuaikan input di `routes/items.js` agar kolom tersebut ikut tersimpan.
3. Latihan Pagination / Limit (Menengah-Lanjut):
   - Modifikasi endpoint `GET /api/materi` agar mendukung query `?limit=10&page=1`.
