const path = require('path');

let db;

/**
 * Penentuan mode database:
 * 1. Jika USE_LOCAL_DB='true' di .env -> gunakan SQLite lokal (jadwal.db)
 * 2. Jika TURSO_DATABASE_URL tidak diisi -> otomatis fallback ke SQLite lokal
 * 3. Jika USE_LOCAL_DB='false' dan ada TURSO_DATABASE_URL -> gunakan Turso Cloud (@libsql/client)
 */
const useLocal = process.env.USE_LOCAL_DB === 'true' || !process.env.TURSO_DATABASE_URL;

if (useLocal) {
  console.log('📁 Menggunakan SQLite lokal (jadwal.db)...');
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, 'jadwal.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Adapter helper agar better-sqlite3 memiliki interface async yang sama dengan @libsql/client
  db.execute = function (opts) {
    const sqlStr = typeof opts === 'string' ? opts : (opts && opts.sql ? opts.sql : '');
    const sql = sqlStr.trim().toUpperCase();
    const args = (typeof opts === 'object' && opts && opts.args) || [];
    if (sql.startsWith('SELECT')) {
      const result = this.prepare(sqlStr).all(...args);
      return { rows: result };
    } else {
      const info = this.prepare(sqlStr).run(...args);
      return { rows: [], lastInsertRowid: info.lastInsertRowid };
    }
  };

  db.executeMultiple = function (sql) {
    this.exec(sql);
  };
} else {
  console.log('🌐 Menggunakan Turso cloud (libSQL)...');
  const { createClient } = require('@libsql/client');
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  });
}

let isDbInitialized = false;

/**
 * Inisialisasi skema tabel database:
 * - users: data akun & password hash bcrypt
 * - items: jadwal kuliah/tutor/lainnya
 * - materi: berkas materi dan tugas
 * - campus_info: beasiswa, lomba, event kampus
 */
async function initDb() {
  if (isDbInitialized) return;

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      time TEXT NOT NULL,
      end_time TEXT,
      note TEXT,
      tipe TEXT NOT NULL,
      days TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS materi (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      subject_key TEXT NOT NULL,
      subject_name TEXT NOT NULL,
      type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      file_path TEXT,
      url TEXT,
      uploaded_at TEXT NOT NULL,
      deadline TEXT,
      task_desc TEXT,
      is_completed INTEGER DEFAULT 0,
      completed_at TEXT,
      proof_path TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS campus_info (
      id TEXT PRIMARY KEY,
      user_id INTEGER,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      organizer TEXT,
      deadline_date TEXT,
      description TEXT,
      link_url TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrasi aman untuk fitur tugas (hanya jalankan jika kolom belum ada di database lama)
  try {
    const tableInfo = await db.execute({ sql: 'PRAGMA table_info(materi);', args: [] });
    const existingCols = new Set(tableInfo.rows.map(r => r.name));
    const tugasColumns = [
      { name: 'deadline', def: 'deadline TEXT' },
      { name: 'task_desc', def: 'task_desc TEXT' },
      { name: 'is_completed', def: 'is_completed INTEGER DEFAULT 0' },
      { name: 'completed_at', def: 'completed_at TEXT' },
      { name: 'proof_path', def: 'proof_path TEXT' }
    ];

    for (const col of tugasColumns) {
      if (!existingCols.has(col.name)) {
        try {
          await db.execute({ sql: `ALTER TABLE materi ADD COLUMN ${col.def};`, args: [] });
        } catch (e) {
          // Abaikan jika sudah ada
        }
      }
    }
  } catch (e) {
    // Abaikan error pragma jika database tidak mendukung
  }

  // Seed data awal info beasiswa, lomba & event jika tabel masih kosong
  try {
    const checkCount = await db.execute({ sql: 'SELECT COUNT(*) AS count FROM campus_info;', args: [] });
    const count = checkCount.rows[0]?.count ?? checkCount.rows[0]?.['COUNT(*)'] ?? 0;
    if (Number(count) === 0) {
      const initialInfos = [
        {
          id: 'starter-info-1',
          category: 'beasiswa',
          title: 'Beasiswa Bank Indonesia 2026',
          organizer: 'Bank Indonesia',
          deadline_date: '2026-11-20',
          description: 'Bantuan biaya pendidikan Rp 1.000.000/bulan, program pembinaan kepemimpinan nasional, dan jejaring komunitas Generasi Baru Indonesia (GenBI) untuk mahasiswa S1 aktif minimal semester 3.',
          link_url: 'https://beasiswa.bi.go.id'
        },
        {
          id: 'starter-info-2',
          category: 'beasiswa',
          title: 'Djarum Beasiswa Plus Angkatan 41',
          organizer: 'Djarum Foundation',
          deadline_date: '2026-11-30',
          description: 'Dana beasiswa selama 1 tahun penuh disertai pelatihan soft skills intensif (Leadership Development, Character Building, Nation Building, dan Competition Challenges). Terbuka untuk seluruh jurusan.',
          link_url: 'https://djarumbeasiswaplus.org'
        },
        {
          id: 'starter-info-3',
          category: 'lomba',
          title: 'Gemastik 2026: UX Design & Software Development',
          organizer: 'Puspresnas Kemdikbudristek',
          deadline_date: '2026-11-15',
          description: 'Kompetisi teknologi informasi & komunikasi mahasiswa tingkat nasional. Kategori Desain Pengalaman Pengguna (UX) dan Pengembangan Aplikasi dengan total hadiah puluhan juta rupiah & sertifikat juara resmi.',
          link_url: 'https://puspresnas.kemdikbud.go.id'
        },
        {
          id: 'starter-info-4',
          category: 'lomba',
          title: 'National Innovation Hackathon 2026',
          organizer: 'Tech Innovation Hub',
          deadline_date: '2026-11-25',
          description: 'Hackathon 48 jam bertema Sustainable Tech & Generative AI. Terbuka untuk tim mahasiswa 2-4 orang. Total hadiah Rp 35 Juta + kesempatan inkubasi startup dan mentoring eksklusif.',
          link_url: 'https://hackathon.id'
        },
        {
          id: 'starter-info-5',
          category: 'event',
          title: 'Tech & AI Career Festival 2026',
          organizer: 'Himpunan Mahasiswa Informatika',
          deadline_date: '2026-11-10',
          description: 'Seminar industri teknologi terdepan, talkshow bersama engineer unicorn, booth pameran karier & magang, serta sesi review CV gratis. Dapatkan e-sertifikat ber-SKP.',
          link_url: 'https://eventmahasiswa.com/tech-fest'
        },
        {
          id: 'starter-info-6',
          category: 'event',
          title: 'Workshop Nasional: Cloud Native & Modern Backend',
          organizer: 'Google Developer Student Clubs',
          deadline_date: '2026-11-18',
          description: 'Hands-on workshop arsitektur serverless, microservices, dan database cloud modern. Dapatkan sertifikat digital dan voucher lab cloud praktikum gratis senilai $100.',
          link_url: 'https://gdsc.community.dev'
        }
      ];

      const now = new Date().toISOString();
      for (const item of initialInfos) {
        await db.execute({
          sql: `INSERT INTO campus_info (id, user_id, category, title, organizer, deadline_date, description, link_url, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [item.id, null, item.category, item.title, item.organizer, item.deadline_date, item.description, item.link_url, now]
        });
      }
    }
  } catch (e) {
    console.warn('[DB Seed Warning]:', e.message);
  }

  isDbInitialized = true;
}

module.exports = { db, initDb };

